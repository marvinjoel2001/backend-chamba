import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../../notifications/notifications.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { MobileRequestRepository } from '../shared/mobile-request.repository';

@Injectable()
export class MobileRequestsCronService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MobileRequestsCronService.name);
  // Si la solicitud sigue sin asignarse cuando falta menos de esto para el
  // inicio programado, se cancela automaticamente.
  private static readonly CANCEL_BEFORE_START_MINUTES = 60;
  // Ventana del recordatorio "tu trabajo empieza pronto".
  private static readonly START_REMINDER_WINDOW_MINUTES = 60;
  // Recordatorio de la noche anterior, en hora de Bolivia: de 19:00 a 22:00.
  // Fuera de ese rango no se manda (nadie quiere un aviso a medianoche); el
  // de 1 hora antes sigue cubriendo el trabajo.
  private static readonly DAY_BEFORE_FROM_HOUR = 19;
  private static readonly DAY_BEFORE_UNTIL_HOUR = 22;
  private static readonly BOLIVIA_OFFSET_MS = -4 * 60 * 60 * 1000;

  constructor(
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly repo: MobileRequestRepository,
  ) {}

  async onApplicationBootstrap() {
    this.logger.log('Running initial checks on startup...');
    // Estas son tareas de mantenimiento: si fallan, se reintentan en el próximo
    // cron. Nunca deben impedir que la API arranque — una excepción sin capturar
    // acá tumba el proceso entero y deja el deploy en crash loop.
    try {
      await this.handleRequestTimeouts();
    } catch (e) {
      this.logger.error('Initial request timeout check failed', e);
    }
    try {
      await this.handleStartReminders();
    } catch (e) {
      this.logger.error('Initial start reminder check failed', e);
    }
    try {
      await this.handleDayBeforeReminders();
    } catch (e) {
      this.logger.error('Initial day-before reminder check failed', e);
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleRequestTimeouts() {
    this.logger.debug('Running request timeout check...');

    // Un solo token (el mas reciente) por solicitud para no procesarla N veces.
    const rows = await this.dataSource.query<any[]>(`
      SELECT jr.id,
             jr.title,
             jr.client_user_id,
             jr.price_type,
             jr.scheduled_at,
             jr.start_date,
             jr.created_at,
             jr.reminder_level,
             pt.token
      FROM job_requests jr
      LEFT JOIN LATERAL (
        SELECT token
        FROM push_tokens
        WHERE user_id = jr.client_user_id
        ORDER BY last_seen_at DESC
        LIMIT 1
      ) pt ON true
      WHERE jr.status IN ('searching', 'negotiating')
    `);

    if (rows.length === 0) return;

    const timeoutConfig = await this.repo.getRequestTimeoutConfig();
    const now = new Date();

    for (const req of rows) {
      const createdAt = new Date(req.created_at);
      const startAt = this.repo.resolveStartAt(
        req.scheduled_at,
        req.start_date,
      );
      const priceKey = this.repo.normalizePriceTypeKey(req.price_type);
      const modalityConfig = timeoutConfig[priceKey];

      const elapsedMinutes =
        (now.getTime() - createdAt.getTime()) / (1000 * 60);

      let timeoutMinutes = modalityConfig.timeoutMinutes;
      let reminder1Minutes = modalityConfig.reminder1Minutes;
      let reminder2Minutes = modalityConfig.reminder2Minutes;

      if (startAt) {
        // Trabajo con fecha/hora de inicio: cancelar si falta menos de 1 hora
        // (o ya paso) y nadie fue asignado.
        const minutesUntilStart =
          (startAt.getTime() - now.getTime()) / (1000 * 60);

        if (
          minutesUntilStart <=
          MobileRequestsCronService.CANCEL_BEFORE_START_MINUTES
        ) {
          await this.cancelRequest(req, 'timeout');
          continue;
        }

        // Recordatorios repartidos en el camino hasta el inicio.
        const totalDurationMins =
          (startAt.getTime() - createdAt.getTime()) / (1000 * 60);
        reminder1Minutes = totalDurationMins / 2;
        reminder2Minutes = totalDurationMins - 120; // 2 horas antes
        if (reminder2Minutes < reminder1Minutes) {
          reminder2Minutes = reminder1Minutes + 30;
        }
      } else {
        if (elapsedMinutes >= timeoutMinutes) {
          await this.cancelRequest(req, 'timeout');
          continue;
        }
      }

      const currentLevel = Number(req.reminder_level || 0);

      if (elapsedMinutes >= reminder1Minutes && currentLevel < 1) {
        await this.sendReminder(req, 1);
      } else if (elapsedMinutes >= reminder2Minutes && currentLevel < 2) {
        await this.sendReminder(req, 2);
      }
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleStartReminders() {
    const rows = await this.dataSource.query<any[]>(`
      SELECT jr.id,
             jr.title,
             jr.client_user_id,
             jr.scheduled_at,
             jr.start_date,
             jo.worker_user_id,
             u.first_name AS worker_first_name,
             u.last_name AS worker_last_name
      FROM job_requests jr
      JOIN job_offers jo ON jo.request_id = jr.id AND jo.status = 'accepted'
      JOIN users u ON u.id = jo.worker_user_id
      WHERE jr.status = 'assigned'
        AND jr.start_reminder_sent = false
        AND (jr.scheduled_at IS NOT NULL OR NULLIF(jr.start_date, '') IS NOT NULL)
    `);

    const now = new Date();

    for (const req of rows) {
      const startAt = this.repo.resolveStartAt(
        req.scheduled_at,
        req.start_date,
      );
      if (!startAt) continue;

      const minutesUntilStart =
        (startAt.getTime() - now.getTime()) / (1000 * 60);
      // Solo dentro de la ventana previa; si ya paso hace mucho, marcamos como
      // enviado para no notificar tarde.
      if (
        minutesUntilStart >
        MobileRequestsCronService.START_REMINDER_WINDOW_MINUTES
      ) {
        continue;
      }

      await this.dataSource.query(
        `UPDATE job_requests SET start_reminder_sent = true WHERE id = $1`,
        [req.id],
      );

      if (minutesUntilStart < -30) {
        // Demasiado tarde para un recordatorio util.
        continue;
      }

      const startsInLabel = this.buildStartsInLabel(minutesUntilStart);
      const workerName =
        `${req.worker_first_name ?? ''} ${req.worker_last_name ?? ''}`.trim() ||
        'Tu trabajador';

      this.logger.log(
        `[startReminder] Trabajo ${req.id} empieza ${startsInLabel}; notificando a worker y cliente`,
      );

      const reminderPayload = {
        requestId: req.id,
        startsAt: startAt.toISOString(),
        minutesUntilStart: Math.round(minutesUntilStart),
      };
      this.realtimeGateway.emitToUser(
        req.worker_user_id,
        'job.starting_soon',
        reminderPayload,
      );
      this.realtimeGateway.emitToUser(
        req.client_user_id,
        'job.starting_soon',
        reminderPayload,
      );

      const workerToken = await this.repo.getLatestPushToken(
        req.worker_user_id,
      );
      await this.notificationsService
        .notifyWorkerJobStartingSoon({
          userId: req.worker_user_id,
          token: workerToken,
          jobTitle: req.title,
          requestId: req.id,
          startsInLabel,
        })
        .catch((e) =>
          this.logger.error('Error sending worker start reminder', e),
        );

      const clientToken = await this.repo.getLatestPushToken(
        req.client_user_id,
      );
      await this.notificationsService
        .notifyClientJobStartingSoon({
          userId: req.client_user_id,
          token: clientToken,
          workerName,
          jobTitle: req.title,
          requestId: req.id,
          startsInLabel,
        })
        .catch((e) =>
          this.logger.error('Error sending client start reminder', e),
        );
    }
  }

  /**
   * La noche anterior a un trabajo programado avisa al cliente y al trabajador
   * que es mañana. Un trabajo aceptado el mismo día no recibe este aviso.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleDayBeforeReminders() {
    const rows = await this.dataSource.query<any[]>(`
      SELECT jr.id,
             jr.title,
             jr.client_user_id,
             jr.scheduled_at,
             jr.start_date,
             jo.worker_user_id,
             u.first_name AS worker_first_name,
             u.last_name AS worker_last_name
      FROM job_requests jr
      JOIN job_offers jo ON jo.request_id = jr.id AND jo.status = 'accepted'
      JOIN users u ON u.id = jo.worker_user_id
      WHERE jr.status = 'assigned'
        AND jr.day_before_reminder_sent = false
        AND (jr.scheduled_at IS NOT NULL OR NULLIF(jr.start_date, '') IS NOT NULL)
    `);
    if (rows.length === 0) return;

    const local = this.boliviaClock(new Date());
    const inWindow =
      local.hour >= MobileRequestsCronService.DAY_BEFORE_FROM_HOUR &&
      local.hour < MobileRequestsCronService.DAY_BEFORE_UNTIL_HOUR;

    for (const req of rows) {
      const startAt = this.repo.resolveStartAt(req.scheduled_at, req.start_date);
      if (!startAt) continue;
      const start = this.boliviaClock(startAt);
      const daysUntil = Math.round((start.day - local.day) / 86_400_000);
      if (daysUntil > 1) continue;
      if (daysUntil === 1 && !inWindow) continue;

      // Se marca antes de avisar: si dos instancias corren a la vez, solo una
      // gana. Si ya es el día (o pasó), se marca sin avisar.
      const claimed = await this.dataSource.query<any[]>(
        `UPDATE job_requests SET day_before_reminder_sent = true
         WHERE id = $1 AND day_before_reminder_sent = false
         RETURNING id`,
        [req.id],
      );
      // TypeORM devuelve [filas, cantidad] en un UPDATE de PostgreSQL.
      const claimedRow = Array.isArray(claimed[0]) ? claimed[0][0] : claimed[0];
      if (daysUntil < 1 || !claimedRow) continue;

      const hasTime =
        req.scheduled_at != null || String(req.start_date ?? '').includes('T');
      const timeLabel = hasTime ? `a las ${start.time}` : '';
      const workerName =
        `${req.worker_first_name ?? ''} ${req.worker_last_name ?? ''}`.trim() ||
        'Tu trabajador';

      this.logger.log(
        `[dayBeforeReminder] Trabajo ${req.id} es mañana; notificando a worker y cliente`,
      );

      await this.notificationsService
        .notifyWorkerJobTomorrow({
          userId: req.worker_user_id,
          jobTitle: req.title,
          requestId: req.id,
          timeLabel,
        })
        .catch((e) =>
          this.logger.error('Error sending worker day-before reminder', e),
        );
      await this.notificationsService
        .notifyClientJobTomorrow({
          userId: req.client_user_id,
          workerName,
          jobTitle: req.title,
          requestId: req.id,
          timeLabel,
        })
        .catch((e) =>
          this.logger.error('Error sending client day-before reminder', e),
        );
    }
  }

  /** Día (medianoche, en ms) y hora en Bolivia, que no tiene horario de verano. */
  private boliviaClock(date: Date): { day: number; hour: number; time: string } {
    const local = new Date(
      date.getTime() + MobileRequestsCronService.BOLIVIA_OFFSET_MS,
    );
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      day: Date.UTC(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate(),
      ),
      hour: local.getUTCHours(),
      time: `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`,
    };
  }

  private buildStartsInLabel(minutesUntilStart: number): string {
    const rounded = Math.round(minutesUntilStart);
    if (rounded <= 0) return 'ahora';
    if (rounded <= 5) return 'en unos minutos';
    if (rounded >= 55) return 'dentro de 1 hora';
    return `en ${rounded} minutos`;
  }

  private async cancelRequest(req: any, reason: string) {
    this.logger.log(`Cancelling request ${req.id} due to ${reason}`);
    const cancelledRows = await this.dataSource.query<any[]>(
      `
      UPDATE job_requests
      SET status = 'cancelled', cancelled_by = NULL, updated_at = NOW()
      WHERE id = $1
        AND status IN ('searching', 'negotiating')
      RETURNING id
      `,
      [req.id],
    );
    if (!cancelledRows[0]) {
      // Alguien acepto/cancelo en paralelo; no hacer nada.
      return;
    }

    // Cerrar ofertas pendientes y avisar a esos workers.
    const closedOffers = await this.repo.closePendingOffers(req.id);
    for (const closed of closedOffers) {
      this.realtimeGateway.emitToUser(closed.workerUserId, 'job.cancelled', {
        requestId: req.id,
        reason,
        cancelerUserId: 'system',
      });
      const token = await this.repo.getLatestPushToken(closed.workerUserId);
      await this.notificationsService
        .notifyRequestClosed({
          userId: closed.workerUserId,
          token,
          jobTitle: req.title,
          requestId: req.id,
        })
        .catch((e) =>
          this.logger.error('Error notifying pending-offer worker', e),
        );
    }

    this.realtimeGateway.emitToUser(req.client_user_id, 'job.cancelled', {
      requestId: req.id,
      reason: reason,
      cancelerUserId: 'system',
    });

    this.realtimeGateway.broadcastRequest('request.status.updated', {
      requestId: req.id,
      status: 'cancelled',
      timestamp: new Date().toISOString(),
    });

    await this.notificationsService
      .notifyClientTimeout({
        userId: req.client_user_id,
        token: req.token,
        jobTitle: req.title,
        requestId: req.id,
      })
      .catch((e) => this.logger.error('Error sending timeout push', e));
  }

  private async sendReminder(req: any, newLevel: number) {
    this.logger.log(`Sending reminder level ${newLevel} for request ${req.id}`);
    await this.dataSource.query(
      `UPDATE job_requests SET reminder_level = $1 WHERE id = $2`,
      [newLevel, req.id],
    );

    this.realtimeGateway.emitToUser(req.client_user_id, 'job.reminder', {
      requestId: req.id,
      level: newLevel,
    });

    await this.notificationsService
      .notifyClientToImproveOffer({
        userId: req.client_user_id,
        token: req.token,
        jobTitle: req.title,
        requestId: req.id,
      })
      .catch((e) => this.logger.error('Error sending reminder push', e));
  }
}
