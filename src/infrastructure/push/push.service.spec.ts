import { PushService } from './push.service';

describe('FCM transport', () => {
  let service: PushService, messaging: any, db: any;
  const message = { title: 'Chamba', body: 'Oferta', tokens: ['one', 'one', 'two'] };
  beforeEach(() => {
    db = { query: jest.fn().mockResolvedValue([]) };
    messaging = { sendEachForMulticast: jest.fn() };
    service = new PushService({ get: () => undefined } as any, db);
    (service as any).messaging = messaging;
  });
  it('does not send expired opportunities', async () => {
    expect(await service.sendToTokens({ ...message, data: { expiresAt: new Date(Date.now() - 1000).toISOString() } })).toBe(0);
    expect(messaging.sendEachForMulticast).not.toHaveBeenCalled();
  });
  it('deduplicates devices and returns the actual provider message ID', async () => {
    messaging.sendEachForMulticast.mockResolvedValue({ successCount: 1, responses: [{ success: true, messageId: 'projects/chamba/messages/123' }] });
    expect(await service.sendToToken({ token: 'one', title: 'Chamba', body: 'Hola' })).toBe('projects/chamba/messages/123');
    expect(messaging.sendEachForMulticast.mock.calls[0][0].tokens).toEqual(['one']);
  });
  it('removes invalid tokens and retries only transient failures', async () => {
    messaging.sendEachForMulticast.mockResolvedValueOnce({ successCount: 0, responses: [
      { success: false, error: { code: 'messaging/registration-token-not-registered' } },
      { success: false, error: { code: 'messaging/server-unavailable' } },
    ] }).mockResolvedValueOnce({ successCount: 1, responses: [{ success: true, messageId: 'ok' }] });
    expect(await service.sendToTokens(message)).toBe(1);
    expect(messaging.sendEachForMulticast.mock.calls.map((c: any) => c[0].tokens)).toEqual([['one', 'two'], ['two']]);
    expect(db.query).toHaveBeenCalledWith('DELETE FROM push_tokens WHERE token = $1', ['one']);
  });
  it('retries a transport outage and preserves a two-minute request TTL', async () => {
    messaging.sendEachForMulticast.mockRejectedValueOnce({ code: 'app/network-error' })
      .mockResolvedValueOnce({ successCount: 2, responses: [{ success: true }, { success: true }] });
    expect(await service.sendToTokens({ ...message, data: { type: 'request_new' } })).toBe(2);
    expect(messaging.sendEachForMulticast.mock.calls[1][0].android.ttl).toBe(120000);
  });
  it('a cancellation replaces the outstanding invitation for the same job', async () => {
    messaging.sendEachForMulticast.mockResolvedValue({ successCount: 1, responses: [{ success: true }] });
    await service.sendToTokens({ ...message, data: { type: 'request_new', jobId: 'job' } });
    await service.sendToTokens({ ...message, data: { type: 'job_cancelled', requestId: 'job' } });
    expect(messaging.sendEachForMulticast.mock.calls.map((c: any) => c[0].android.notification.tag)).toEqual(['job:job', 'job:job']);
  });
});
