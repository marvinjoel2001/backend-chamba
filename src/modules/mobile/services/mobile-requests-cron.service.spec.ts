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
    db.query.mockResolvedValueOnce([request('daily', 10, { start_date: '2026-10-09T09:00:00' })]).mockResolvedValueOnce([]);
    await cron.handleRequestTimeouts();
    expect(db.query).toHaveBeenCalledTimes(2);
  });
  it('uses Bolivia time consistently and accepts both API and UI modality names', () => {
    expect(repo.resolveStartAt(null, '2026-10-09T17:00:00')?.toISOString()).toBe('2026-10-09T21:00:00.000Z');
    expect(repo.resolveStartAt(null, '2026-10-09')?.toISOString()).toBe('2026-10-09T13:00:00.000Z');
    expect(repo.resolveOfferLifetimeSeconds(null, 'hourly')).toBe(120);
    expect(repo.resolveOfferLifetimeSeconds(null, 'daily')).toBe(900);
    expect(repo.resolveOfferLifetimeSeconds(null, 'fixed')).toBe(300);
  });
});
