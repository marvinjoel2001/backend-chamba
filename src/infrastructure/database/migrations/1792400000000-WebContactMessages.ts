import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lo que llega desde la landing: reportes ("Reportar un problema") y
 * suscripciones al boletín. Antes la web simulaba el envío y se perdía.
 * Un correo se suscribe una sola vez. Idempotente.
 */
export class WebContactMessages1792400000000 implements MigrationInterface {
  name = 'WebContactMessages1792400000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE IF NOT EXISTS "web_contact_messages" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "kind" VARCHAR(20) NOT NULL,
        "category" VARCHAR(40),
        "email" VARCHAR(200) NOT NULL,
        "message" TEXT,
        "handled_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await runner.query(
      `CREATE INDEX IF NOT EXISTS "idx_web_contact_kind" ON "web_contact_messages" ("kind", "created_at" DESC)`,
    );
    await runner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_web_contact_subscriber"
         ON "web_contact_messages" (LOWER("email")) WHERE "kind" = 'subscribe'`,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE IF EXISTS "web_contact_messages"`);
  }
}
