import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Eliminación de cuenta con espera de 30 días (MobileAccountService).
 * Idempotente: no hace nada si las columnas o el índice ya existen.
 */
export class AddAccountDeletion1791800000000 implements MigrationInterface {
  name = 'AddAccountDeletion1791800000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deletion_requested_at" TIMESTAMPTZ`,
    );
    await runner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deletion_scheduled_for" TIMESTAMPTZ`,
    );
    await runner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ`,
    );
    // El cron diario busca solo las cuentas con eliminación programada.
    await runner.query(
      `CREATE INDEX IF NOT EXISTS "idx_users_deletion_scheduled_for"
       ON "users" ("deletion_scheduled_for")
       WHERE "deletion_scheduled_for" IS NOT NULL`,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP INDEX IF EXISTS "idx_users_deletion_scheduled_for"`);
    await runner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "deleted_at"`);
    await runner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "deletion_scheduled_for"`);
    await runner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "deletion_requested_at"`);
  }
}
