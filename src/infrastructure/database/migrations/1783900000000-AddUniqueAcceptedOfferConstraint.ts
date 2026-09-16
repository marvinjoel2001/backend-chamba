import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueAcceptedOfferConstraint1783900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_one_accepted_offer_per_request
      ON job_offers (request_id)
      WHERE status = 'accepted';
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_job_offers_request_status
      ON job_offers (request_id, status);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_one_accepted_offer_per_request;
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_job_offers_request_status;
    `);
  }
}
