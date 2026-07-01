import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChatReadTracking1782900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "chat_threads"
            ADD COLUMN "client_last_read_at" timestamp with time zone,
            ADD COLUMN "worker_last_read_at" timestamp with time zone;
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "chat_threads"
            DROP COLUMN "client_last_read_at",
            DROP COLUMN "worker_last_read_at";
        `);
  }
}
