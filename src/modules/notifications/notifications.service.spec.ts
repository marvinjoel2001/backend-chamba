import { NotificationsService } from './notifications.service';

describe('Notification delivery policy', () => {
  let service: NotificationsService;
  let push: any, repo: any, db: any, realtime: any;
  beforeEach(() => {
    push = { sendToTokens: jest.fn().mockResolvedValue(1) };
    repo = { create: (data: any) => data, save: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}) };
    db = { query: jest.fn().mockResolvedValue([]) };
    realtime = { emitToUser: jest.fn(), presentNotification: jest.fn().mockResolvedValue(new Set()) };
    service = new NotificationsService(push, repo, db, realtime);
  });
  const offer = { userId: 'client', token: null, workerName: 'Ana', amount: 100, jobTitle: 'Pintura', requestId: 'job' };
  it('marks only the specified notifications owned by the authenticated user', async () => {
    await service.markNotificationsAsRead('client', ['visible-notification']);
    expect(repo.update).toHaveBeenCalledWith(expect.objectContaining({ userId: 'client', isRead: false,
      id: expect.objectContaining({ _value: ['visible-notification'] }) }), { isRead: true });
    expect(realtime.emitToUser).toHaveBeenCalledWith('client', 'notifications.changed', {});
    repo.update.mockClear();
    await service.markNotificationsAsRead('client', []);
    expect(repo.update).not.toHaveBeenCalled();
  });
  it('persists a new offer even when no device token exists', async () => {
    await service.notifyClientNewOffer(offer);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ userId: 'client', type: 'offer_new' }));
    expect(push.sendToTokens).not.toHaveBeenCalled();
    expect(realtime.emitToUser).toHaveBeenCalledWith('client', 'notifications.changed', expect.any(Object));
  });
  it('sends push to every registered device without a presentation acknowledgement', async () => {
    db.query.mockResolvedValue([{ token: 'one' }, { token: 'two' }, { token: 'one' }]);
    await service.notifyClientNewOffer(offer);
    expect(push.sendToTokens).toHaveBeenCalledWith(expect.objectContaining({ tokens: ['one', 'two'], data: expect.objectContaining({ userId: 'client', eventId: expect.any(String) }) }));
  });
  it('suppresses only the device that acknowledged presentation', async () => {
    db.query.mockResolvedValue([{ token: 'visible-phone' }, { token: 'other-phone' }]);
    realtime.presentNotification.mockResolvedValue(new Set(['visible-phone']));
    await service.notifyClientNewOffer(offer);
    expect(push.sendToTokens).toHaveBeenCalledWith(expect.objectContaining({ tokens: ['other-phone'] }));
  });
  it('falls back to push on socket presentation failure', async () => {
    db.query.mockResolvedValue([{ token: 'phone' }]);
    realtime.presentNotification.mockRejectedValue(new Error('offline'));
    await service.notifyClientNewOffer(offer);
    expect(push.sendToTokens).toHaveBeenCalledWith(expect.objectContaining({ tokens: ['phone'] }));
  });
  it('chat uses the persisted message ID and does not spam the notification center', async () => {
    db.query.mockResolvedValue([{ token: 'phone' }]);
    await service.notifyNewMessage({ userId: 'client', token: null, threadId: 'thread', messageId: 'message', body: 'Hola' });
    expect(repo.save).not.toHaveBeenCalled();
    expect(push.sendToTokens).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventId: 'message', threadId: 'thread' }) }));
  });
  it('wave retries keep one event identity and each worker receives their own distance', async () => {
    const params = { users: [{ userId: 'a', token: '', distanceKm: '1.2' }, { userId: 'b', token: '', distanceKm: '8.0' }], jobId: 'job', category: 'Pintura', offeredPrice: 'Bs 100', distanceKm: '1.2' };
    await service.notifyWorkersForJobWave(params);
    await service.notifyWorkersForJobWave(params);
    expect(repo.save.mock.calls[0][0].id).toBe(repo.save.mock.calls[2][0].id);
    expect(repo.save.mock.calls[0][0].body).toContain('1.2 km');
    expect(repo.save.mock.calls[1][0].body).toContain('8.0 km');
  });
});
