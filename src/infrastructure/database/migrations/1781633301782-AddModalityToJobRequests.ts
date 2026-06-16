import { MigrationInterface, QueryRunner } from "typeorm";

export class AddModalityToJobRequests1781633301782 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "job_requests"
            ADD COLUMN "modality" text,
            ADD COLUMN "estimated_hours" integer,
            ADD COLUMN "hourly_rate" numeric(12,2),
            ADD COLUMN "days" integer,
            ADD COLUMN "daily_rate" numeric(12,2),
            ADD COLUMN "start_date" text;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "job_requests"
            DROP COLUMN "modality",
            DROP COLUMN "estimated_hours",
            DROP COLUMN "hourly_rate",
            DROP COLUMN "days",
            DROP COLUMN "daily_rate",
            DROP COLUMN "start_date";
        `);
    }

}
