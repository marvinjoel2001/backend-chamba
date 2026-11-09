/**
 * Agenda de trabajos: un trabajador puede tener varios trabajos asignados
 * mientras no caigan el mismo día. Un trabajo para mañana ya no le impide
 * aceptar otro para hoy.
 *
 * Cada trabajo ocupa un rango de días (hora de Bolivia):
 *  - empieza el día de `start_date` (o de `scheduled_at`); sin fecha, hoy;
 *  - "por día" ocupa `days` días seguidos; el resto, un solo día;
 *  - un trabajo asignado cuya fecha ya pasó sigue ocupando hoy (todavía no se
 *    completó), igual que uno sin fecha.
 *
 * Dos trabajos chocan si sus rangos se tocan.
 */

export const JOB_TIME_ZONE = 'America/La_Paz';

const TODAY_SQL = `(NOW() AT TIME ZONE '${JOB_TIME_ZONE}')::date`;

/** Día en que empieza el trabajo según lo que pidió el cliente, o NULL. */
function startDaySql(alias: string): string {
  return `COALESCE(
    CASE WHEN ${alias}.start_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      THEN LEFT(${alias}.start_date, 10)::date END,
    (${alias}.scheduled_at AT TIME ZONE '${JOB_TIME_ZONE}')::date
  )`;
}

function isDailySql(alias: string): string {
  return `(COALESCE(${alias}.modality, '') = 'daily'
    OR (${alias}.modality IS NULL AND (LOWER(COALESCE(${alias}.price_type, '')) LIKE '%dia%'
      OR LOWER(COALESCE(${alias}.price_type, '')) LIKE '%día%'
      OR LOWER(COALESCE(${alias}.price_type, '')) LIKE '%day%')))`;
}

/** Primer día que ocupa el trabajo (nunca antes de hoy). */
export function jobFirstDaySql(alias: string): string {
  return `GREATEST(COALESCE(${startDaySql(alias)}, ${TODAY_SQL}), ${TODAY_SQL})`;
}

/** Último día que ocupa el trabajo (nunca antes de hoy). */
export function jobLastDaySql(alias: string): string {
  return `GREATEST(
    COALESCE(${startDaySql(alias)}, ${TODAY_SQL})
      + (CASE WHEN ${isDailySql(alias)}
          THEN GREATEST(COALESCE(${alias}.days, 1), 1) - 1 ELSE 0 END),
    ${TODAY_SQL}
  )`;
}

/**
 * EXISTS: el trabajador `workerParam` tiene asignado otro trabajo que cae
 * algún día del trabajo `candidateAlias`.
 */
export function workerHasConflictingJobSql(
  workerParam: string,
  candidateAlias: string,
): string {
  return `EXISTS (
    SELECT 1
    FROM job_offers sjo
    JOIN job_requests sjr ON sjr.id = sjo.request_id
    WHERE sjo.worker_user_id = ${workerParam}
      AND sjo.status = 'accepted'
      AND sjr.status = 'assigned'
      AND sjr.id <> ${candidateAlias}.id
      AND ${jobFirstDaySql('sjr')} <= ${jobLastDaySql(candidateAlias)}
      AND ${jobFirstDaySql(candidateAlias)} <= ${jobLastDaySql('sjr')}
  )`;
}

/** El trabajo asignado está programado para un día después de hoy. */
export function jobIsScheduledSql(alias: string): string {
  return `(${alias}.work_started_at IS NULL
    AND COALESCE(${alias}.worker_arrived, false) = false
    AND ${startDaySql(alias)} > ${TODAY_SQL})`;
}
