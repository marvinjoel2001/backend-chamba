import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Versión 1.1.0:
 *  - Materiales: el cliente dice quién los pone (`materials_mode`: 'client',
 *    'worker' o 'discuss') y puede dejar un detalle. Si los pone el
 *    trabajador, su oferta lleva el monto de materiales aparte de la mano de
 *    obra (`job_offers.materials_amount`).
 *  - Video del lugar: un video corto por solicitud.
 *  - Paneles: el admin y las agencias con contraseña inicial deben cambiarla
 *    al entrar (`must_change_password`).
 * Idempotente.
 */
export class MaterialsVideoAndPasswordChange1793800000000
  implements MigrationInterface
{
  name = 'MaterialsVideoAndPasswordChange1793800000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE job_requests
      ADD COLUMN IF NOT EXISTS materials_mode text,
      ADD COLUMN IF NOT EXISTS materials_note text,
      ADD COLUMN IF NOT EXISTS video_url text,
      ADD COLUMN IF NOT EXISTS video_public_id text,
      ADD COLUMN IF NOT EXISTS video_thumbnail_url text`);
    await q.query(`ALTER TABLE job_offers
      ADD COLUMN IF NOT EXISTS materials_amount numeric(12,2)`);
    await q.query(`ALTER TABLE admin_users
      ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false`);
    await q.query(`ALTER TABLE agencies
      ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE agencies DROP COLUMN IF EXISTS must_change_password`);
    await q.query(`ALTER TABLE admin_users DROP COLUMN IF EXISTS must_change_password`);
    await q.query(`ALTER TABLE job_offers DROP COLUMN IF EXISTS materials_amount`);
    await q.query(`ALTER TABLE job_requests
      DROP COLUMN IF EXISTS video_thumbnail_url,
      DROP COLUMN IF EXISTS video_public_id,
      DROP COLUMN IF EXISTS video_url,
      DROP COLUMN IF EXISTS materials_note,
      DROP COLUMN IF EXISTS materials_mode`);
  }
}
