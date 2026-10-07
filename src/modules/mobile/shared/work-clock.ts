/** A completed or paused clock has a fixed end. Amounts are rounded once, at settlement. */
export function workClock(row: Record<string, any>, now = new Date()) {
  const started = row.work_started_at ? new Date(row.work_started_at).getTime() : null;
  const end = new Date(row.completed_at ?? row.work_paused_at ?? now).getTime();
  const elapsedSeconds = started == null ? 0 : Math.max(0,
    Math.floor((end - started) / 1000) - Number(row.work_paused_seconds ?? 0));
  const agreed = Number(row.amount ?? 0);
  const hours = Number(row.estimated_hours ?? 0);
  const rate = hours > 0 ? agreed / hours : Number(row.hourly_rate ?? 0);
  const hourly = (row.modality ?? row.price_type) === 'hourly';
  return {
    workElapsedSeconds: elapsedSeconds,
    workPaused: row.work_paused_at != null,
    effectiveHourlyRate: hourly ? rate : null,
    currentAmount: row.settled_amount != null ? Number(row.settled_amount)
      : hourly ? Math.round(rate * elapsedSeconds / 3600 * 100) / 100 : agreed,
  };
}
