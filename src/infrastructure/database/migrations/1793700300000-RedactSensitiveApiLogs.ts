import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hasta ahora el log de peticiones (Admin → Logs) guardaba completas las fotos
 * del carnet y la selfie de la verificación, las claves de IA del admin y el
 * número de carnet del registro. El filtro ya está corregido; esto borra lo
 * que quedó guardado. La tabla la crea ApiLogsService al arrancar, así que en
 * una base nueva todavía no existe.
 */
export class RedactSensitiveApiLogs1793700300000 implements MigrationInterface {
  name = 'RedactSensitiveApiLogs1793700300000';

  async up(q: QueryRunner): Promise<void> {
    const [{ exists }] = await q.query(
      `SELECT to_regclass('public.api_request_logs') IS NOT NULL AS exists`,
    );
    if (!exists) return;

    // Verificación de identidad (fotos del carnet y selfie, también en la
    // respuesta) y configuración de IA (claves): se borran esas filas.
    await q.query(
      `DELETE FROM api_request_logs
       WHERE path LIKE '/api/mobile/worker/verification%'
          OR path LIKE '/api/mobile/admin/ai-config%'
          OR path LIKE '/api/users/%/verification%'
          OR path LIKE '/api/users/verification%'`,
    );
    // En el resto se quitan los campos sensibles que hubieran quedado.
    await q.query(
      `UPDATE api_request_logs
       SET request_body_json = request_body_json
         - 'ciNumber' - 'idPhotoBase64' - 'facePhotoBase64'
         - 'geminiKey' - 'nvidiaKey' - 'deepseekKey'
       WHERE request_body_json ?| ARRAY['ciNumber', 'idPhotoBase64', 'facePhotoBase64',
                                        'geminiKey', 'nvidiaKey', 'deepseekKey']`,
    );
    await q.query(
      `UPDATE api_request_logs SET response_preview = NULL
       WHERE response_preview ~* '(id|face)_?photo_?url'`,
    );
  }

  async down(): Promise<void> {
    // No hay vuelta atrás: los datos borrados no deben volver.
  }
}
