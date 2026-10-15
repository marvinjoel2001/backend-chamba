import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

/** Días de espera entre la solicitud y el borrado definitivo. */
export const ACCOUNT_DELETION_GRACE_DAYS = 30;

export interface AccountDeletionStatus {
  pending: boolean;
  requestedAt: string | null;
  scheduledFor: string | null;
}

/**
 * Eliminación de cuenta en dos tiempos (requisito de Google Play):
 *
 * 1. El usuario la pide escribiendo su correo exacto. Queda programada a
 *    30 días; mientras tanto la cuenta sigue funcionando y puede cancelarla.
 * 2. Un cron diario anonimiza las cuentas vencidas: borra datos personales,
 *    contraseña y tokens de push, y bloquea el acceso. Los trabajos, ofertas
 *    y chats quedan para la otra parte, firmados como "Usuario eliminado".
 */
@Injectable()
export class MobileAccountService {
  private readonly logger = new Logger(MobileAccountService.name);

  constructor(private readonly dataSource: DataSource) {}

  async getDeletionStatus(userId: string): Promise<AccountDeletionStatus> {
    const rows = await this.dataSource.query<
      { deletion_requested_at: Date | null; deletion_scheduled_for: Date | null }[]
    >(
      `SELECT deletion_requested_at, deletion_scheduled_for
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    if (!rows[0]) throw new NotFoundException('Cuenta no encontrada');
    return this.toStatus(rows[0]);
  }

  async requestDeletion(userId: string, email: string): Promise<AccountDeletionStatus> {
    const typed = (email ?? '').trim().toLowerCase();
    if (!typed) {
      throw new BadRequestException('Escribe el correo de tu cuenta para confirmar.');
    }
    const rows = await this.dataSource.query<
      {
        email: string;
        type: string;
        deletion_requested_at: Date | null;
        deletion_scheduled_for: Date | null;
      }[]
    >(
      `SELECT email, type, deletion_requested_at, deletion_scheduled_for
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    const user = rows[0];
    if (!user) throw new NotFoundException('Cuenta no encontrada');
    if ((user.email ?? '').trim().toLowerCase() !== typed) {
      throw new BadRequestException('El correo no coincide con el de tu cuenta.');
    }
    // Pedirla de nuevo no corre el plazo: se devuelve la fecha ya programada.
    if (user.deletion_scheduled_for) return this.toStatus(user);

    if (await this.hasActiveWork(userId, user.type)) {
      throw new BadRequestException(
        'Tienes un trabajo o una solicitud en curso. Termínalo o cancélalo antes de eliminar tu cuenta.',
      );
    }

    const updated = await this.dataSource.query<
      { deletion_requested_at: Date; deletion_scheduled_for: Date }[]
    >(
      `UPDATE users
       SET deletion_requested_at = NOW(),
           deletion_scheduled_for = NOW() + make_interval(days => $2)
       WHERE id = $1 AND deleted_at IS NULL AND deletion_scheduled_for IS NULL
       RETURNING deletion_requested_at, deletion_scheduled_for`,
      [userId, ACCOUNT_DELETION_GRACE_DAYS],
    );
    // Si otra petición ganó la carrera, devolvemos lo que quedó guardado.
    if (!updated[0]) return this.getDeletionStatus(userId);
    this.logger.log(`Cuenta ${userId}: eliminación programada para ${updated[0].deletion_scheduled_for.toISOString()}`);
    return this.toStatus(updated[0]);
  }

  async cancelDeletion(userId: string): Promise<AccountDeletionStatus> {
    const rows = await this.dataSource.query<{ id: string }[]>(
      `UPDATE users
       SET deletion_requested_at = NULL, deletion_scheduled_for = NULL
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [userId],
    );
    if (!rows[0]) throw new NotFoundException('Cuenta no encontrada');
    this.logger.log(`Cuenta ${userId}: eliminación cancelada`);
    return { pending: false, requestedAt: null, scheduledFor: null };
  }

  /** Corre todos los días a las 3:00 y elimina las cuentas vencidas. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeDueAccounts(): Promise<number> {
    const due = await this.dataSource.query<{ id: string; type: string }[]>(
      `SELECT id, type FROM users
       WHERE deleted_at IS NULL
         AND deletion_scheduled_for IS NOT NULL
         AND deletion_scheduled_for <= NOW()`,
    );
    let purged = 0;
    for (const user of due) {
      // Un trabajo que empezó durante la espera posterga el borrado.
      if (await this.hasActiveWork(user.id, user.type)) {
        this.logger.warn(`Cuenta ${user.id}: borrado postergado por trabajo en curso`);
        continue;
      }
      try {
        await this.anonymize(user.id);
        purged++;
      } catch (error) {
        this.logger.error(`Cuenta ${user.id}: no se pudo eliminar`, error as Error);
      }
    }
    if (due.length) this.logger.log(`Eliminación de cuentas: ${purged}/${due.length} completadas`);
    return purged;
  }

  private async anonymize(userId: string): Promise<void> {
    await this.dataSource.transaction(async (tx) => {
      const rows = await tx.query<{ id: string }[]>(
        `UPDATE users
         SET first_name = 'Usuario',
             last_name = 'eliminado',
             email = 'eliminado+' || id || '@chamba.invalid',
             phone = NULL,
             country_code = NULL,
             ci_number = NULL,
             id_photo_url = NULL,
             face_photo_url = NULL,
             profile_photo_url = NULL,
             profile_photo_public_id = NULL,
             current_location = NULL,
             google_id = NULL,
             is_available = false,
             is_blocked = true,
             deleted_at = NOW(),
             deletion_scheduled_for = NULL
         WHERE id = $1 AND deleted_at IS NULL
           AND deletion_scheduled_for IS NOT NULL
           AND deletion_scheduled_for <= NOW()
         RETURNING id`,
        [userId],
      );
      // Se canceló justo antes del borrado: no se toca nada.
      if (!rows[0]) return;
      await tx.query(`DELETE FROM auth_credentials WHERE user_id = $1`, [userId]);
      await tx.query(`DELETE FROM push_tokens WHERE user_id = $1`, [userId]);
    });
  }

  private async hasActiveWork(userId: string, type: string): Promise<boolean> {
    const rows =
      type === 'worker'
        ? await this.dataSource.query<{ id: string }[]>(
            `SELECT jr.id FROM job_offers jo
             JOIN job_requests jr ON jr.id = jo.request_id
             WHERE jo.worker_user_id = $1 AND jo.status = 'accepted'
               AND jr.status IN ('assigned', 'in_progress')
             LIMIT 1`,
            [userId],
          )
        : await this.dataSource.query<{ id: string }[]>(
            `SELECT id FROM job_requests
             WHERE client_user_id = $1
               AND status IN ('searching', 'negotiating', 'assigned', 'in_progress')
             LIMIT 1`,
            [userId],
          );
    return rows.length > 0;
  }

  private toStatus(row: {
    deletion_requested_at: Date | null;
    deletion_scheduled_for: Date | null;
  }): AccountDeletionStatus {
    const scheduled = row.deletion_scheduled_for;
    return {
      pending: scheduled != null,
      requestedAt: row.deletion_requested_at ? new Date(row.deletion_requested_at).toISOString() : null,
      scheduledFor: scheduled ? new Date(scheduled).toISOString() : null,
    };
  }
}
