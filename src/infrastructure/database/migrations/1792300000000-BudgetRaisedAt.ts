import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cuándo subió el cliente su presupuesto por última vez. La app del trabajador
 * lo compara con su oferta pendiente: si el cliente subió después, le ofrece
 * aceptar el precio nuevo aunque su contraoferta fuera mayor. Idempotente.
 */
export class BudgetRaisedAt1792300000000 implements MigrationInterface {
  name = 'BudgetRaisedAt1792300000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `ALTER TABLE "job_requests" ADD COLUMN IF NOT EXISTS "budget_raised_at" TIMESTAMPTZ`,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE "job_requests" DROP COLUMN IF EXISTS "budget_raised_at"`);
  }
}
