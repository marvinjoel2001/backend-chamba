import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReminderLevelToJobRequests1782866723182 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "job_requests" ADD "reminder_level" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "job_requests" DROP COLUMN "reminder_level"`,
    );
  }
}
