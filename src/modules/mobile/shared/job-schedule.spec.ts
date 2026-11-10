import { jobStartDayLabel } from './job-schedule';

describe('jobStartDayLabel', () => {
  // 10 nov 2026, 14:00 en Bolivia (UTC-4).
  const now = new Date('2026-11-10T18:00:00Z');

  it('sin fecha o para hoy no lleva etiqueta', () => {
    expect(jobStartDayLabel(null, now)).toBeNull();
    expect(jobStartDayLabel('', now)).toBeNull();
    expect(jobStartDayLabel('2026-11-10', now)).toBeNull();
    expect(jobStartDayLabel('2026-11-09T08:00:00', now)).toBeNull();
  });

  it('mañana y días siguientes', () => {
    expect(jobStartDayLabel('2026-11-11T08:00:00', now)).toBe('mañana');
    expect(jobStartDayLabel('2026-11-13', now)).toBe('el 13 nov');
    expect(jobStartDayLabel('2026-12-01', now)).toBe('el 1 dic');
  });

  it('usa el día de Bolivia, no el UTC', () => {
    // 11 nov 02:00 UTC todavía es 10 nov 22:00 en La Paz.
    const lateNight = new Date('2026-11-11T02:00:00Z');
    expect(jobStartDayLabel('2026-11-11', lateNight)).toBe('mañana');
  });

  it('texto que no es fecha no rompe', () => {
    expect(jobStartDayLabel('pronto', now)).toBeNull();
  });
});
