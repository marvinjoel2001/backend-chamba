import { MigrationInterface, QueryRunner } from 'typeorm';

export class RequestStatusHistoryAndCancelReason1794000000000
  implements MigrationInterface
{
  name = 'RequestStatusHistoryAndCancelReason1794000000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "job_requests"
        ADD COLUMN IF NOT EXISTS "cancel_reason" TEXT,
        ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "cancelled_by_role" VARCHAR(30);
      ALTER TABLE "payments"
        ADD COLUMN IF NOT EXISTS "admin_note" TEXT;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "job_request_status_history" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "request_id" UUID NOT NULL REFERENCES "job_requests"("id") ON DELETE CASCADE,
        "from_status" VARCHAR(40),
        "to_status" VARCHAR(40) NOT NULL,
        "changed_by_user_id" UUID,
        "changed_by_role" VARCHAR(30) NOT NULL DEFAULT 'system',
        "reason" TEXT,
        "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "idx_job_request_status_history_request"
        ON "job_request_status_history" ("request_id", "created_at" ASC);
      CREATE INDEX IF NOT EXISTS "idx_job_request_status_history_actor"
        ON "job_request_status_history" ("changed_by_user_id", "to_status");
    `);

    await q.query(`
      INSERT INTO "job_request_status_history" ("request_id", "from_status", "to_status", "changed_by_user_id", "changed_by_role", "created_at")
      SELECT jr.id, NULL, 'searching', jr.client_user_id, 'client', jr.created_at
      FROM "job_requests" jr
      WHERE NOT EXISTS (
        SELECT 1 FROM "job_request_status_history" h WHERE h.request_id = jr.id
      );
    `);

    await q.query(`
      UPDATE "job_requests"
      SET "cancelled_by_role" = CASE
        WHEN "cancelled_by" IS NULL THEN 'system'
        WHEN "cancelled_by" = "client_user_id" THEN 'client'
        ELSE 'worker'
      END,
      "cancelled_at" = COALESCE("cancelled_at", "updated_at", NOW())
      WHERE "status" = 'cancelled' AND "cancelled_by_role" IS NULL;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "job_request_status_history"`);
    await q.query(`
      ALTER TABLE "job_requests"
        DROP COLUMN IF EXISTS "cancel_reason",
        DROP COLUMN IF EXISTS "cancelled_at",
        DROP COLUMN IF EXISTS "cancelled_by_role";
      ALTER TABLE "payments"
        DROP COLUMN IF EXISTS "admin_note";
    `);
  }
}
