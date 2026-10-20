import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Comisión de Chamba sobre los trabajos de trabajadores independientes. Se
 * congela al completarse el trabajo (porcentaje que el admin tenía puesto en
 * ese momento), igual que el libro de agencias. Los trabajos de agencia la
 * dejan en NULL: a Chamba la cobra el libro de la agencia. Los trabajos ya
 * completados quedan en NULL; nunca se cobra hacia atrás. Idempotente.
 */
export class PlatformCommission1792100000000 implements MigrationInterface {
  name = 'PlatformCommission1792100000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE "job_requests"
      ADD COLUMN IF NOT EXISTS "platform_commission_rate" DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS "platform_fee" NUMERIC(12,2)`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE "job_requests"
      DROP COLUMN IF EXISTS "platform_commission_rate",
      DROP COLUMN IF EXISTS "platform_fee"`);
  }
}
