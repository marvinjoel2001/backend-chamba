import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAgenciesTable1783365530130 implements MigrationInterface {

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "agencies" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "name" character varying NOT NULL,
          "tax_id" character varying,
          "contact_email" character varying NOT NULL,
          "contact_phone" character varying,
          "commission_rate" double precision NOT NULL DEFAULT 0,
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT "PK_agencies" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      ALTER TABLE "users" ADD "agency_id" uuid;
      ALTER TABLE "users" ADD "is_agency_worker" boolean NOT NULL DEFAULT false;
      ALTER TABLE "users" ADD CONSTRAINT "FK_users_agency" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE "job_offers" ADD "offered_by_agency_id" uuid;
      ALTER TABLE "job_offers" ADD CONSTRAINT "FK_job_offers_agency" FOREIGN KEY ("offered_by_agency_id") REFERENCES "agencies"("id") ON DELETE SET NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_offers" DROP CONSTRAINT "FK_job_offers_agency";
      ALTER TABLE "job_offers" DROP COLUMN "offered_by_agency_id";
    `);

    await queryRunner.query(`
      ALTER TABLE "users" DROP CONSTRAINT "FK_users_agency";
      ALTER TABLE "users" DROP COLUMN "is_agency_worker";
      ALTER TABLE "users" DROP COLUMN "agency_id";
    `);

    await queryRunner.query(`DROP TABLE "agencies";`);
  }

}
