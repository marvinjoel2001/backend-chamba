import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Vincular un trabajador que ya tiene cuenta exige su consentimiento: se le
 * envía un código por notificación y la agencia lo ingresa. Una invitación
 * viva por agencia y trabajador; el código se guarda hasheado. Idempotente.
 */
export class AgencyWorkerInvites1792200000000 implements MigrationInterface {
  name = 'AgencyWorkerInvites1792200000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE IF NOT EXISTS "agency_worker_invites" (
        "agency_id" UUID NOT NULL REFERENCES "agencies"("id") ON DELETE CASCADE,
        "worker_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "code_hash" VARCHAR(64) NOT NULL,
        "attempts" INTEGER NOT NULL DEFAULT 0,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY ("agency_id", "worker_user_id")
      )`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE IF EXISTS "agency_worker_invites"`);
  }
}
