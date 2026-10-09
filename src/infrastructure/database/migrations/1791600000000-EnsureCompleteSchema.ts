import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Completa el esquema en bases creadas solo con las migraciones registradas en
 * DatabaseModule (baseline + 5). El baseline es de antes de que existieran las
 * agencias, los leads, el portafolio, el panel admin y varias columnas, y esas
 * migraciones antiguas no estaban registradas, por lo que una base nueva se
 * quedaba sin ellas (p. ej. GET /mobile/request-status fallaba con
 * `relation "agencies" does not exist`).
 *
 * Todo es idempotente: en una base que ya tenga parte del esquema (por
 * DATABASE_SYNC o por migraciones manuales) no cambia ni rompe nada.
 */
export class EnsureCompleteSchema1791600000000 implements MigrationInterface {
  name = 'EnsureCompleteSchema1791600000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    // Panel de administración.
    await runner.query(`CREATE TABLE IF NOT EXISTS "admin_users" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "username" character varying NOT NULL,
      "passwordHash" character varying NOT NULL,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_admin_users_username" UNIQUE ("username"),
      CONSTRAINT "PK_admin_users" PRIMARY KEY ("id")
    )`);

    // Agencias (B2B).
    await runner.query(`CREATE TABLE IF NOT EXISTS "agencies" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "name" character varying NOT NULL,
      "tax_id" character varying,
      "contact_email" character varying NOT NULL,
      "contact_phone" character varying,
      "commission_rate" double precision NOT NULL DEFAULT 0,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_agencies" PRIMARY KEY ("id")
    )`);
    await runner.query(
      `ALTER TABLE "agencies" ADD COLUMN IF NOT EXISTS "password_hash" character varying`,
    );
    await runner.query(
      `ALTER TABLE "agencies" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true`,
    );

    // Leads de trabajadores (landing).
    await runner.query(`CREATE TABLE IF NOT EXISTS "worker_leads" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "fullName" character varying NOT NULL,
      "whatsapp" character varying NOT NULL,
      "email" character varying,
      "city" character varying NOT NULL,
      "category" character varying NOT NULL,
      "isContacted" boolean NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_worker_leads_id" PRIMARY KEY ("id")
    )`);

    // Portafolio del trabajador.
    await runner.query(`CREATE TABLE IF NOT EXISTS worker_portfolio_photos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      url text NOT NULL,
      public_id text NOT NULL,
      caption varchar(200) NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT NOW()
    )`);
    await runner.query(`CREATE INDEX IF NOT EXISTS idx_worker_portfolio_photos_worker
      ON worker_portfolio_photos (worker_user_id, created_at DESC)`);

    // Columnas de users.
    await runner.query(`ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "hourly_rate" numeric(12,2),
      ADD COLUMN IF NOT EXISTS "daily_rate" numeric(12,2),
      ADD COLUMN IF NOT EXISTS "agency_id" uuid,
      ADD COLUMN IF NOT EXISTS "is_agency_worker" boolean NOT NULL DEFAULT false`);
    // work_modalities es jsonb (el código usa @> jsonb_build_array); si existe
    // como text[] de la migración antigua se convierte.
    await runner.query(`DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'users' AND column_name = 'work_modalities'
        ) THEN
          ALTER TABLE "users" ADD COLUMN "work_modalities" jsonb NOT NULL DEFAULT '[]'::jsonb;
        ELSIF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'users' AND column_name = 'work_modalities'
            AND data_type = 'ARRAY'
        ) THEN
          ALTER TABLE "users" ALTER COLUMN "work_modalities" DROP DEFAULT;
          ALTER TABLE "users" ALTER COLUMN "work_modalities" TYPE jsonb
            USING to_jsonb("work_modalities");
          ALTER TABLE "users" ALTER COLUMN "work_modalities" SET DEFAULT '[]'::jsonb;
        END IF;
      END $$`);

    // Columnas de job_requests / job_offers / chat_threads.
    await runner.query(
      `ALTER TABLE "job_requests" ADD COLUMN IF NOT EXISTS "cancelled_by" uuid`,
    );
    await runner.query(
      `ALTER TABLE "job_offers" ADD COLUMN IF NOT EXISTS "offered_by_agency_id" uuid`,
    );
    await runner.query(`ALTER TABLE "chat_threads"
      ADD COLUMN IF NOT EXISTS "client_last_read_at" timestamp with time zone,
      ADD COLUMN IF NOT EXISTS "worker_last_read_at" timestamp with time zone,
      ADD COLUMN IF NOT EXISTS "client_deleted" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "worker_deleted" boolean NOT NULL DEFAULT false`);

    // Claves foráneas (solo si no existen).
    await this.addForeignKey(
      runner,
      'FK_job_requests_cancelled_by',
      '"job_requests"',
      '"cancelled_by"',
      '"users"("id")',
    );
    await this.addForeignKey(
      runner,
      'FK_users_agency',
      '"users"',
      '"agency_id"',
      '"agencies"("id")',
    );
    await this.addForeignKey(
      runner,
      'FK_job_offers_agency',
      '"job_offers"',
      '"offered_by_agency_id"',
      '"agencies"("id")',
    );

    // Índices de ofertas.
    await runner.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_one_accepted_offer_per_request
      ON job_offers (request_id) WHERE status = 'accepted'`);
    await runner.query(`CREATE INDEX IF NOT EXISTS idx_job_offers_request_status
      ON job_offers (request_id, status)`);
  }

  // Es una migración de reparación: no se revierte (borraría datos reales).
  async down(): Promise<void> {
    return;
  }

  private async addForeignKey(
    runner: QueryRunner,
    name: string,
    table: string,
    column: string,
    reference: string,
  ): Promise<void> {
    await runner.query(`DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN
          ALTER TABLE ${table} ADD CONSTRAINT "${name}"
            FOREIGN KEY (${column}) REFERENCES ${reference} ON DELETE SET NULL;
        END IF;
      END $$`);
  }
}
