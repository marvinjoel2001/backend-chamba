import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationsTable1717330000000 implements MigrationInterface {
  name = 'CreateNotificationsTable1717330000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create notifications table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        type VARCHAR(100) NOT NULL,
        data JSONB DEFAULT NULL,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index on user_id for faster queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id 
      ON notifications (user_id)
    `);

    // Create composite index for getUserNotifications query (user_id + createdAt desc)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_created 
      ON notifications (user_id, created_at DESC)
    `);

    // Create index on is_read for markNotificationsAsRead queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_read 
      ON notifications (user_id, is_read) 
      WHERE is_read = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_notifications_user_read
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_notifications_user_created
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_notifications_user_id
    `);

    // Drop table
    await queryRunner.query(`
      DROP TABLE IF EXISTS notifications
    `);
  }
}
