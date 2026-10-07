import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillAcceptedJobChats1791333000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO chat_threads (request_id, client_user_id, worker_user_id)
      SELECT jr.id, jr.client_user_id, jo.worker_user_id FROM job_requests jr
      JOIN job_offers jo ON jo.request_id = jr.id AND jo.status = 'accepted'
      WHERE jr.status IN ('assigned', 'in_progress', 'completed', 'cancelled')
      ON CONFLICT (request_id, client_user_id, worker_user_id) DO NOTHING
    `);
  }

  async down(): Promise<void> {
    // Preserve conversation history when reverting the application version.
  }
}
