import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recordatorio de la noche anterior para trabajos programados: marca si ya se
 * avisó al cliente y al trabajador que el trabajo es mañana. Idempotente.
 */
export class AddDayBeforeReminderSent1793900000000 implements MigrationInterface {
  name = 'AddDayBeforeReminderSent1793900000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE job_requests
      ADD COLUMN IF NOT EXISTS day_before_reminder_sent boolean NOT NULL DEFAULT false`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE job_requests DROP COLUMN IF EXISTS day_before_reminder_sent`);
  }
}
