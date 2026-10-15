import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Operación de agencias: comisión que la agencia cobra a sus trabajadores,
 * libro de trabajos completados (montos congelados al completarse), pagos a
 * trabajadores, liquidaciones con Chamba y avisos enviados. Idempotente.
 *
 * `agencies.commission_rate` sigue siendo la comisión de Chamba sobre la
 * agencia (la fija el admin). `agencies.worker_commission_rate` está declarada
 * en la entidad Agency para que DATABASE_SYNC no la borre; el resto son tablas
 * sin entidad.
 */
export class AgencyOperations1792000000000 implements MigrationInterface {
  name = 'AgencyOperations1792000000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `ALTER TABLE "agencies" ADD COLUMN IF NOT EXISTS "worker_commission_rate" DOUBLE PRECISION NOT NULL DEFAULT 0`,
    );
    await runner.query(`
      CREATE TABLE IF NOT EXISTS "agency_worker_terms" (
        "worker_user_id" UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
        "agency_id" UUID NOT NULL REFERENCES "agencies"("id") ON DELETE CASCADE,
        "commission_rate" DOUBLE PRECISION,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await runner.query(`
      CREATE TABLE IF NOT EXISTS "agency_job_ledger" (
        "request_id" UUID PRIMARY KEY REFERENCES "job_requests"("id") ON DELETE CASCADE,
        "agency_id" UUID NOT NULL REFERENCES "agencies"("id") ON DELETE CASCADE,
        "worker_user_id" UUID NOT NULL,
        "amount" NUMERIC(12,2) NOT NULL,
        "worker_rate" DOUBLE PRECISION NOT NULL,
        "chamba_rate" DOUBLE PRECISION NOT NULL,
        "is_digital" BOOLEAN NOT NULL,
        "completed_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await runner.query(
      `CREATE INDEX IF NOT EXISTS "idx_agency_job_ledger_agency" ON "agency_job_ledger" ("agency_id", "completed_at" DESC)`,
    );
    await runner.query(`
      CREATE TABLE IF NOT EXISTS "agency_payouts" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "agency_id" UUID NOT NULL REFERENCES "agencies"("id") ON DELETE CASCADE,
        "worker_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "amount" NUMERIC(12,2) NOT NULL,
        "kind" VARCHAR(20) NOT NULL DEFAULT 'paid',
        "note" TEXT,
        "paid_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await runner.query(
      `CREATE INDEX IF NOT EXISTS "idx_agency_payouts_agency" ON "agency_payouts" ("agency_id", "paid_at" DESC)`,
    );
    await runner.query(`
      CREATE TABLE IF NOT EXISTS "agency_settlements" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "agency_id" UUID NOT NULL REFERENCES "agencies"("id") ON DELETE CASCADE,
        "direction" VARCHAR(20) NOT NULL,
        "amount" NUMERIC(12,2) NOT NULL,
        "note" TEXT,
        "created_by" UUID,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await runner.query(`
      CREATE TABLE IF NOT EXISTS "agency_messages" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "agency_id" UUID NOT NULL REFERENCES "agencies"("id") ON DELETE CASCADE,
        "title" VARCHAR(80) NOT NULL,
        "body" TEXT NOT NULL,
        "worker_ids" UUID[] NOT NULL DEFAULT '{}',
        "recipients" INTEGER NOT NULL DEFAULT 0,
        "pushed" INTEGER NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE IF EXISTS "agency_messages"`);
    await runner.query(`DROP TABLE IF EXISTS "agency_settlements"`);
    await runner.query(`DROP TABLE IF EXISTS "agency_payouts"`);
    await runner.query(`DROP TABLE IF EXISTS "agency_job_ledger"`);
    await runner.query(`DROP TABLE IF EXISTS "agency_worker_terms"`);
    await runner.query(`ALTER TABLE "agencies" DROP COLUMN IF EXISTS "worker_commission_rate"`);
  }
}
