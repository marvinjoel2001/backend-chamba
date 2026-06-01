import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentMethodToJobRequests1717260000000
  implements MigrationInterface
{
  name = 'AddPaymentMethodToJobRequests1717260000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add payment_method column to job_requests table
    await queryRunner.query(`
      ALTER TABLE job_requests 
      ADD COLUMN IF NOT EXISTS payment_method VARCHAR(100) DEFAULT 'Efectivo'
    `);

    // Update existing rows to have default value
    await queryRunner.query(`
      UPDATE job_requests 
      SET payment_method = 'Efectivo' 
      WHERE payment_method IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove payment_method column
    await queryRunner.query(`
      ALTER TABLE job_requests 
      DROP COLUMN IF EXISTS payment_method
    `);
  }
}
