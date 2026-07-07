import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAgencyAuth1783600000000 implements MigrationInterface {
  name = 'AddAgencyAuth1783600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "agencies" ADD "password_hash" character varying;
      ALTER TABLE "agencies" ADD "is_active" boolean NOT NULL DEFAULT true;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "agencies" DROP COLUMN "is_active";
      ALTER TABLE "agencies" DROP COLUMN "password_hash";
    `);
  }
}
