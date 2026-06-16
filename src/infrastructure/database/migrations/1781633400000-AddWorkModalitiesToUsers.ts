import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWorkModalitiesToUsers1781633400000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN "work_modalities" text[] NOT NULL DEFAULT '{}',
            ADD COLUMN "hourly_rate" numeric(12,2),
            ADD COLUMN "daily_rate" numeric(12,2);
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users"
            DROP COLUMN "work_modalities",
            DROP COLUMN "hourly_rate",
            DROP COLUMN "daily_rate";
        `);
    }

}
