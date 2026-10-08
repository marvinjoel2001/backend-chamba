import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkerPortfolio1791500000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE worker_portfolio_photos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      url text NOT NULL,
      public_id text NOT NULL,
      caption varchar(200) NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT NOW()
    )`);
    await runner.query(`CREATE INDEX idx_worker_portfolio_photos_worker
      ON worker_portfolio_photos (worker_user_id, created_at DESC)`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE worker_portfolio_photos');
  }
}
