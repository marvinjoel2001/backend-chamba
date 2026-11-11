import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAvatarUrlToBotProfiles1794363000000
  implements MigrationInterface
{
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE chamba_simulation.profiles ADD COLUMN IF NOT EXISTS avatar_url text;`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE chamba_simulation.profiles DROP COLUMN IF EXISTS avatar_url;`,
    );
  }
}
