import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Las cuentas demo se recreaban en cada arranque con la contraseña 123456,
 * publicada en el repositorio. El seed ya no existe; esta migración deja esas
 * cuentas inutilizables sin borrar el historial que pudieran tener:
 * bloqueadas, fuera del mapa y del reparto, sin contraseña ni dispositivos
 * para push, y con sus solicitudes abiertas canceladas.
 */
export const DEMO_ACCOUNT_EMAILS = [
  'cliente.demo@chamba.app',
  'worker.roberto@chamba.app',
  'worker.elena@chamba.app',
  'worker.marcos@chamba.app',
];

export class DisableDemoAccounts1793700000000 implements MigrationInterface {
  name = 'DisableDemoAccounts1793700000000';

  async up(q: QueryRunner): Promise<void> {
    const demoIds = `SELECT id FROM users WHERE LOWER(email) = ANY($1::text[])`;
    await q.query(
      `UPDATE job_requests SET status = 'cancelled', updated_at = NOW()
       WHERE client_user_id IN (${demoIds})
         AND status NOT IN ('completed', 'cancelled')`,
      [DEMO_ACCOUNT_EMAILS],
    );
    await q.query(
      `UPDATE job_offers SET status = 'expired'
       WHERE worker_user_id IN (${demoIds}) AND status = 'pending'`,
      [DEMO_ACCOUNT_EMAILS],
    );
    await q.query(
      `UPDATE users
       SET is_blocked = true, is_available = false, current_location = NULL, updated_at = NOW()
       WHERE LOWER(email) = ANY($1::text[])`,
      [DEMO_ACCOUNT_EMAILS],
    );
    await q.query(
      `DELETE FROM auth_credentials WHERE user_id IN (${demoIds})`,
      [DEMO_ACCOUNT_EMAILS],
    );
    await q.query(`DELETE FROM push_tokens WHERE user_id IN (${demoIds})`, [
      DEMO_ACCOUNT_EMAILS,
    ]);
  }

  async down(): Promise<void> {
    // Irreversible a propósito: las cuentas demo no deben volver a producción.
  }
}
