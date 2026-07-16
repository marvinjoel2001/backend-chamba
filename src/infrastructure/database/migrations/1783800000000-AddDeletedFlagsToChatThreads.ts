import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeletedFlagsToChatThreads1783800000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chat_threads
      ADD COLUMN IF NOT EXISTS client_deleted BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS worker_deleted BOOLEAN NOT NULL DEFAULT false;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chat_threads
      DROP COLUMN IF EXISTS client_deleted,
      DROP COLUMN IF EXISTS worker_deleted;
    `);
  }
}
