import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCancelledByToJobRequests1781472880205 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "job_requests" ADD "cancelled_by" uuid`);
        await queryRunner.query(`ALTER TABLE "job_requests" ADD CONSTRAINT "FK_job_requests_cancelled_by" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "job_requests" DROP CONSTRAINT "FK_job_requests_cancelled_by"`);
        await queryRunner.query(`ALTER TABLE "job_requests" DROP COLUMN "cancelled_by"`);
    }

}
