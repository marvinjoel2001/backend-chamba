import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El backend solo borra de Cloudinary imágenes que él mismo subió. Antes
 * guardaba como "suyo" el publicId que mandaba la app, y con eso cualquiera
 * podía hacer borrar fotos ajenas (el publicId se ve en la URL de cualquier
 * foto).
 *
 *  - job_request_photos.public_id pasa a admitir NULL: foto que no subió el
 *    backend (versiones viejas de la app) y que por eso nunca se borra.
 *  - Un publicId que aparece en más de un lugar (otra solicitud, otro perfil,
 *    un portafolio) no es de quien lo mandó: se le quita a las solicitudes y
 *    perfiles para que nadie pueda borrar esa imagen. La imagen no se toca.
 */
export class MediaOwnership1793700400000 implements MigrationInterface {
  name = 'MediaOwnership1793700400000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE job_request_photos ALTER COLUMN public_id DROP NOT NULL`,
    );

    const [{ portfolio }] = await q.query(
      `SELECT to_regclass('public.worker_portfolio_photos') IS NOT NULL AS portfolio`,
    );
    const references = [
      `SELECT public_id AS pid FROM job_request_photos`,
      `SELECT profile_photo_public_id AS pid FROM users`,
      ...(portfolio
        ? [`SELECT public_id AS pid FROM worker_portfolio_photos`]
        : []),
    ].join(' UNION ALL ');
    const duplicates: Array<{ pid: string }> = await q.query(
      `SELECT pid FROM (${references}) refs
       WHERE pid IS NOT NULL AND pid <> ''
       GROUP BY pid HAVING COUNT(*) > 1`,
    );
    const ids = duplicates.map((row) => row.pid);
    if (!ids.length) return;

    await q.query(
      `UPDATE job_request_photos SET public_id = NULL WHERE public_id = ANY($1::text[])`,
      [ids],
    );
    await q.query(
      `UPDATE users SET profile_photo_public_id = NULL
       WHERE profile_photo_public_id = ANY($1::text[])`,
      [ids],
    );
  }

  async down(): Promise<void> {
    // Volver a exigir public_id rompería las fotos sin dueño: no se revierte.
  }
}
