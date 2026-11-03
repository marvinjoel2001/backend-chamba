import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cerrar todas las sesiones de un usuario de la app: los tokens emitidos antes
 * de `tokens_valid_after` dejan de valer. Se usa al recuperar la contraseña y
 * al vincular Google a una cuenta que tenía contraseña.
 */
export class SessionRevocation1793700100000 implements MigrationInterface {
  name = 'SessionRevocation1793700100000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tokens_valid_after" TIMESTAMPTZ`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "tokens_valid_after"`,
    );
  }
}
