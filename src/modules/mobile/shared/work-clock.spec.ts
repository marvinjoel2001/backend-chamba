import { workClock } from './work-clock';

describe('shared clock and agreed settlement', () => {
  const row = { amount: 120, modality: 'hourly', estimated_hours: 2,
    hourly_rate: 20, work_started_at: '2026-10-07T12:00:00Z' };
  it('uses the negotiated hourly rate and persisted start after reopening', () => {
    expect(workClock(row, new Date('2026-10-07T12:30:00Z'))).toMatchObject({
      effectiveHourlyRate: 60, workElapsedSeconds: 1800, currentAmount: 30 });
  });
  it('excludes accumulated pauses and stops an ongoing pause', () => {
    expect(workClock({ ...row, work_paused_seconds: 300,
      work_paused_at: '2026-10-07T12:30:00Z' }, new Date('2026-10-07T14:00:00Z')))
      .toMatchObject({ workElapsedSeconds: 1500, currentAmount: 25, workPaused: true });
  });
  it('stops at completion and prefers the persisted charge', () => {
    expect(workClock({ ...row, completed_at: '2026-10-07T12:30:00Z', settled_amount: '30' },
      new Date('2026-10-09T00:00:00Z'))).toMatchObject({ workElapsedSeconds: 1800, currentAmount: 30 });
  });
  it.each(['daily', 'fixed'])('%s preserves the negotiated total regardless of time', (modality) => {
    expect(workClock({ ...row, modality, days: 2 }, new Date('2026-10-07T12:00:20Z')).currentAmount).toBe(120);
  });
  it('never bills time before arrival confirmation', () => {
    expect(workClock({ ...row, work_started_at: null }).currentAmount).toBe(0);
  });
});
