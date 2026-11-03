import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reembolsos de pagos hechos en la app (Admin → Pagos → Reembolsos) y fin del
 * QR fijo con "Ya pagué": un QR solo se cobra con un proveedor que confirma el
 * pago por su API, así que los métodos que usaban el QR fijo se desactivan
 * (la app deja de ofrecerlos y esas solicitudes se pagan como efectivo).
 */
export class PaymentRefunds1793700200000 implements MigrationInterface {
  name = 'PaymentRefunds1793700200000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "payments"
        ADD COLUMN IF NOT EXISTS "refund_reason" TEXT,
        ADD COLUMN IF NOT EXISTS "refund_requested_at" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "refunded_at" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "refunded_by" UUID,
        ADD COLUMN IF NOT EXISTS "refund_note" TEXT`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_payments_request" ON "payments" ("request_id")`,
    );
    await q.query(
      `UPDATE "payment_methods" SET "isActive" = false
       WHERE "config" LIKE '%"provider":"manual_qr"%'`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_payments_request"`);
    await q.query(`
      ALTER TABLE "payments"
        DROP COLUMN IF EXISTS "refund_reason",
        DROP COLUMN IF EXISTS "refund_requested_at",
        DROP COLUMN IF EXISTS "refunded_at",
        DROP COLUMN IF EXISTS "refunded_by",
        DROP COLUMN IF EXISTS "refund_note"`);
  }
}
