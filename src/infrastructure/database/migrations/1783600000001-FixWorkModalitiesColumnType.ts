import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La migración AddWorkModalitiesToUsers creó "work_modalities" como text[],
 * pero la entidad User y las queries del módulo mobile (jsonb_array_length,
 * @> jsonb_build_array) esperan jsonb. En bases creadas con DATABASE_SYNC la
 * columna ya es jsonb, así que esta corrección solo actúa si detecta text[]
 * (instalaciones desde cero vía migraciones). Idempotente y no destructiva.
 */
export class FixWorkModalitiesColumnType1783600000001 implements MigrationInterface {
  name = 'FixWorkModalitiesColumnType1783600000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users'
            AND column_name = 'work_modalities'
            AND data_type = 'ARRAY'
        ) THEN
          ALTER TABLE "users" ALTER COLUMN "work_modalities" DROP DEFAULT;
          ALTER TABLE "users" ALTER COLUMN "work_modalities" TYPE jsonb
            USING to_jsonb("work_modalities");
          ALTER TABLE "users" ALTER COLUMN "work_modalities" SET DEFAULT '[]'::jsonb;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No se revierte: volver a text[] rompería el código que espera jsonb.
  }
}
