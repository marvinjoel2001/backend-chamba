import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pagos dentro de la app (PaymentsService) + código del método de pago en la
 * solicitud. Tabla sin entidad TypeORM (como job_requests), así DATABASE_SYNC
 * no la toca. Idempotente.
 */
export class AddPayments1791900000000 implements MigrationInterface {
  name = 'AddPayments1791900000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `ALTER TABLE "job_requests" ADD COLUMN IF NOT EXISTS "payment_method_code" VARCHAR(50)`,
    );
    await runner.query(`
      CREATE TABLE IF NOT EXISTS "payments" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "request_id" UUID NOT NULL REFERENCES "job_requests"("id") ON DELETE CASCADE,
        "offer_id" UUID NOT NULL REFERENCES "job_offers"("id") ON DELETE CASCADE,
        "client_user_id" UUID NOT NULL,
        "method_code" VARCHAR(50) NOT NULL,
        "method_name" VARCHAR(100),
        "provider" VARCHAR(50) NOT NULL,
        "amount" NUMERIC(12,2) NOT NULL,
        "currency" VARCHAR(10) NOT NULL DEFAULT 'BOB',
        "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
        "action" VARCHAR(20) NOT NULL DEFAULT 'none',
        "external_id" TEXT,
        "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "expires_at" TIMESTAMPTZ,
        "reported_at" TIMESTAMPTZ,
        "confirmed_at" TIMESTAMPTZ,
        "confirmed_by" UUID,
        "failure_reason" TEXT,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await runner.query(
      `CREATE INDEX IF NOT EXISTS "idx_payments_offer" ON "payments" ("offer_id", "created_at" DESC)`,
    );
    await runner.query(
      `CREATE INDEX IF NOT EXISTS "idx_payments_status" ON "payments" ("status", "created_at" DESC)`,
    );
    await runner.query(
      `CREATE INDEX IF NOT EXISTS "idx_payments_external" ON "payments" ("provider", "external_id")
       WHERE "external_id" IS NOT NULL`,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE IF EXISTS "payments"`);
    await runner.query(`ALTER TABLE "job_requests" DROP COLUMN IF EXISTS "payment_method_code"`);
  }
}
