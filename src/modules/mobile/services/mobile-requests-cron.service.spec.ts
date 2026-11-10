import { MobileRequestsCronService } from './mobile-requests-cron.service';
import { MobileRequestRepository } from '../shared/mobile-request.repository';

describe('request deadlines and reminders', () => {
  let db: any, notifications: any, realtime: any, repo: MobileRequestRepository, cron: MobileRequestsCronService;
  const now = new Date('2026-10-09T12:00:00Z');
  const request = (price_type: string, ageMinutes: number, extra = {}) => ({
    id: 'qa-job', client_user_id: 'client', title: 'QA', price_type,
    created_at: new Date(now.getTime() - ageMinutes * 60000), reminder_level: 0, ...extra });
  beforeEach(() => {
    jest.useFakeTimers(); jest.setSystemTime(now);
    db = { query: jest.fn().mockResolvedValue([]) };
    notifications = { notifyClientTimeout: jest.fn().mockResolvedValue(undefined), notifyClientToImproveOffer: jest.fn().mockResolvedValue(undefined) };
    realtime = { emitToUser: jest.fn(), broadcastRequest: jest.fn() };
    repo = new MobileRequestRepository(db, realtime);
    jest.spyOn(repo, 'getRequestTimeoutConfig').mockResolvedValue(repo.getDefaultRequestTimeoutByPriceType());
    jest.spyOn(repo, 'closePendingOffers').mockResolvedValue([]);
    cron = new MobileRequestsCronService(db, notifications, realtime, repo);
  });
  afterEach(() => jest.useRealTimers());
  it.each([['Por hora', 30], ['fixed', 120], ['daily', 720]])(
    '%s expires at its search timeout, but loses a race to acceptance safely', async (mode, minutes) => {
      db.query.mockResolvedValueOnce([request(mode as string, minutes as number)]).mockResolvedValueOnce([]);
      await cron.handleRequestTimeouts();
      expect(db.query.mock.calls[1][0]).toContain("status IN ('searching', 'negotiating')");
      expect(repo.closePendingOffers).not.toHaveBeenCalled();
      expect(notifications.notifyClientTimeout).not.toHaveBeenCalled();
    });
  it.each([['hourly', 10], ['fixed', 30], ['Por día', 120]])('%s sends its first reminder', async (mode, minutes) => {
    db.query.mockResolvedValueOnce([request(mode as string, minutes as number)]).mockResolvedValueOnce([]);
    await cron.handleRequestTimeouts();
    expect(notifications.notifyClientToImproveOffer).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'qa-job' }));
    expect(realtime.emitToUser).toHaveBeenCalledWith('client', 'job.reminder', { requestId: 'qa-job', level: 1 });
  });
  it('a scheduled request uses the start deadline instead of the ordinary age timeout', async () => {
    db.query.mockResolvedValueOnce([request('daily', 1000, { start_date: '2026-10-09T10:30:00' })]);
    await cron.handleRequestTimeouts();
    expect(notifications.notifyClientTimeout).not.toHaveBeenCalled();
    expect(repo.closePendingOffers).not.toHaveBeenCalled();
  });
  it('scheduled requests enter cancellation when only 60 minutes remain', async () => {
    db.query.mockResolvedValueOnce([request('daily', 300, { start_date: '2026-10-09T09:00:00' })]).mockResolvedValueOnce([]);
    await cron.handleRequestTimeouts();
    expect(db.query).toHaveBeenCalledTimes(2);
  });
  // 12:00Z son las 08:00 en Bolivia.
  it.each([['2026-10-09T08:30:00'], ['2026-10-09T09:00:00'], ['2026-10-09T07:00:00'], ['2026-10-08']])(
    'un pedido para hoy creado cerca del inicio (%s) no se cancela a los minutos', async (start_date) => {
      db.query.mockResolvedValueOnce([request('daily', 4, { start_date })]);
      await cron.handleRequestTimeouts();
      expect(db.query).toHaveBeenCalledTimes(1);
      expect(notifications.notifyClientToImproveOffer).not.toHaveBeenCalled();
    });
  it('ese pedido sí vence con el tiempo normal de su modalidad', async () => {
    db.query.mockResolvedValueOnce([request('daily', 720, { start_date: '2026-10-08T22:00:00' })]).mockResolvedValueOnce([]);
    await cron.handleRequestTimeouts();
    expect(db.query).toHaveBeenCalledTimes(2);
  });
  describe('day-before reminder', () => {
    const assigned = (start_date: string) => ({
      id: 'qa-job', title: 'Instalar ducha', client_user_id: 'client', worker_user_id: 'worker',
      worker_first_name: 'Jorge', worker_last_name: 'QA', scheduled_at: null, start_date });
    const at = (iso: string) => jest.setSystemTime(new Date(iso));
    beforeEach(() => {
      notifications.notifyWorkerJobTomorrow = jest.fn().mockResolvedValue(null);
      notifications.notifyClientJobTomorrow = jest.fn().mockResolvedValue(null);
    });

    it('avisa a los dos la noche anterior, con la hora del trabajo', async () => {
      at('2026-11-09T23:30:00Z'); // 19:30 en Bolivia
      db.query.mockResolvedValueOnce([assigned('2026-11-10T08:00:00')])
        .mockResolvedValueOnce([[{ id: 'qa-job' }], 1]);
      await cron.handleDayBeforeReminders();
      expect(db.query.mock.calls[1][0]).toContain('day_before_reminder_sent = true');
      expect(notifications.notifyWorkerJobTomorrow).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'worker', timeLabel: 'a las 08:00' }));
      expect(notifications.notifyClientJobTomorrow).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'client', workerName: 'Jorge QA', timeLabel: 'a las 08:00' }));
    });

    it('sin hora elegida no inventa una', async () => {
      at('2026-11-09T23:30:00Z');
      db.query.mockResolvedValueOnce([assigned('2026-11-10')]).mockResolvedValueOnce([[{ id: 'qa-job' }], 1]);
      await cron.handleDayBeforeReminders();
      expect(notifications.notifyWorkerJobTomorrow).toHaveBeenCalledWith(expect.objectContaining({ timeLabel: '' }));
    });

    it.each([
      ['antes de las 19:00', '2026-11-09T22:00:00Z', '2026-11-10T08:00:00'],
      ['después de las 22:00', '2026-11-10T02:30:00Z', '2026-11-10T08:00:00'],
      ['faltando más de un día', '2026-11-09T23:30:00Z', '2026-11-12T08:00:00'],
    ])('no avisa %s', async (_label, now, start) => {
      at(now);
      db.query.mockResolvedValueOnce([assigned(start)]);
      await cron.handleDayBeforeReminders();
      expect(db.query).toHaveBeenCalledTimes(1);
      expect(notifications.notifyWorkerJobTomorrow).not.toHaveBeenCalled();
    });

    it('un trabajo de hoy se marca sin avisar "mañana"', async () => {
      at('2026-11-10T12:00:00Z'); // 08:00 en Bolivia
      db.query.mockResolvedValueOnce([assigned('2026-11-10T16:00:00')]).mockResolvedValueOnce([[{ id: 'qa-job' }], 1]);
      await cron.handleDayBeforeReminders();
      expect(db.query).toHaveBeenCalledTimes(2);
      expect(notifications.notifyWorkerJobTomorrow).not.toHaveBeenCalled();
      expect(notifications.notifyClientJobTomorrow).not.toHaveBeenCalled();
    });

    it('si otra instancia ya lo marcó, no avisa dos veces', async () => {
      at('2026-11-09T23:30:00Z');
      db.query.mockResolvedValueOnce([assigned('2026-11-10T08:00:00')]).mockResolvedValueOnce([[], 0]);
      await cron.handleDayBeforeReminders();
      expect(notifications.notifyWorkerJobTomorrow).not.toHaveBeenCalled();
    });
  });

  it('uses Bolivia time consistently and accepts both API and UI modality names', () => {
    expect(repo.resolveStartAt(null, '2026-10-09T17:00:00')?.toISOString()).toBe('2026-10-09T21:00:00.000Z');
    expect(repo.resolveStartAt(null, '2026-10-09')?.toISOString()).toBe('2026-10-09T13:00:00.000Z');
    expect(repo.resolveOfferLifetimeSeconds(null, 'hourly')).toBe(120);
    expect(repo.resolveOfferLifetimeSeconds(null, 'daily')).toBe(900);
    expect(repo.resolveOfferLifetimeSeconds(null, 'fixed')).toBe(300);
  });
});
