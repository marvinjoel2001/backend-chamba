import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Restaura `users.google_id`, que crea el baseline pero que la entidad User no
 * declaraba: con DATABASE_SYNC=true TypeORM la eliminaba y el login con Google
 * fallaba con `column u.google_id does not exist`.
 *
 * Idempotente: no hace nada si la columna o el índice ya existen.
 */
export class EnsureUsersGoogleId1791700000000 implements MigrationInterface {
  name = 'EnsureUsersGoogleId1791700000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_id" text`,
    );
    await runner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_users_google_id" ON "users" ("google_id")`,
    );
  }

  async down(): Promise<void> {
    // La columna pertenece al esquema base; no se elimina al revertir.
  }
}
