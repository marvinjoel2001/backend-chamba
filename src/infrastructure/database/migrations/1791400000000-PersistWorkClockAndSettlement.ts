import { MigrationInterface, QueryRunner } from 'typeorm';

export class PersistWorkClockAndSettlement1791400000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE job_requests
      ADD COLUMN work_paused_at timestamptz,
      ADD COLUMN work_paused_seconds integer NOT NULL DEFAULT 0,
      ADD COLUMN settled_amount numeric(12,2)`);
    // Historical completed jobs keep their accepted price; never retroactively rebill.
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE job_requests DROP COLUMN work_paused_at,
      DROP COLUMN work_paused_seconds, DROP COLUMN settled_amount`);
  }
}
