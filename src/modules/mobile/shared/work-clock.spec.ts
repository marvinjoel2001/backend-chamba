import { workClock } from './work-clock';

describe('shared clock and agreed settlement', () => {
  const row = { amount: 120, modality: 'hourly', estimated_hours: 2,
    hourly_rate: 20, work_started_at: '2026-10-07T12:00:00Z' };
  it('reports the negotiated hourly rate and elapsed time without billing by time', () => {
    expect(workClock(row, new Date('2026-10-07T12:30:00Z'))).toMatchObject({
      effectiveHourlyRate: 60, workElapsedSeconds: 1800, currentAmount: 120 });
  });
  it('excludes accumulated pauses from the elapsed time', () => {
    expect(workClock({ ...row, work_paused_seconds: 300,
      work_paused_at: '2026-10-07T12:30:00Z' }, new Date('2026-10-07T14:00:00Z')))
      .toMatchObject({ workElapsedSeconds: 1500, currentAmount: 120, workPaused: true });
  });
  it('stops at completion and prefers the persisted charge', () => {
    expect(workClock({ ...row, completed_at: '2026-10-07T12:30:00Z', settled_amount: '120' },
      new Date('2026-10-09T00:00:00Z'))).toMatchObject({ workElapsedSeconds: 1800, currentAmount: 120 });
  });
  it.each(['hourly', 'daily', 'fixed'])('%s charges the agreed total regardless of time', (modality) => {
    expect(workClock({ ...row, modality, days: 2 }, new Date('2026-10-07T17:00:00Z')).currentAmount).toBe(120);
  });
  it('the agreed total does not depend on arrival confirmation', () => {
    expect(workClock({ ...row, work_started_at: null }).currentAmount).toBe(120);
  });
});
