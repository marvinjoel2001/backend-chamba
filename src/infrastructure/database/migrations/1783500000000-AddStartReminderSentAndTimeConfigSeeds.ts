import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStartReminderSentAndTimeConfigSeeds1783500000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "job_requests" ADD "start_reminder_sent" boolean NOT NULL DEFAULT false`,
    );

    // Semillas editables desde el panel admin. ON CONFLICT DO NOTHING para no
    // pisar valores ya configurados.
    await queryRunner.query(
      `
      INSERT INTO app_config (key, value_json, updated_at)
      VALUES ('offer_lifetime_by_price_type', $1::jsonb, NOW())
      ON CONFLICT (key) DO NOTHING
      `,
      [JSON.stringify({ fixed: 300, hour: 120, day: 900 })],
    );

    await queryRunner.query(
      `
      INSERT INTO app_config (key, value_json, updated_at)
      VALUES ('request_timeout_by_price_type', $1::jsonb, NOW())
      ON CONFLICT (key) DO NOTHING
      `,
      [
        JSON.stringify({
          fixed: {
            timeoutMinutes: 120,
            reminder1Minutes: 30,
            reminder2Minutes: 60,
          },
          hour: {
            timeoutMinutes: 30,
            reminder1Minutes: 10,
            reminder2Minutes: 20,
          },
          day: {
            timeoutMinutes: 720,
            reminder1Minutes: 120,
            reminder2Minutes: 360,
          },
        }),
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "job_requests" DROP COLUMN "start_reminder_sent"`,
    );
    await queryRunner.query(
      `DELETE FROM app_config WHERE key IN ('offer_lifetime_by_price_type', 'request_timeout_by_price_type')`,
    );
  }
}
