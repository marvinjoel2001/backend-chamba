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
  it('sends new-job alerts data-only so the app rings like a call', async () => {
    messaging.sendEachForMulticast.mockResolvedValue({ successCount: 1, responses: [{ success: true }] });
    await service.sendToTokens({ ...message, data: { type: 'request_new', jobId: 'job' } });
    const sent = messaging.sendEachForMulticast.mock.calls[0][0];
    // Con `notification` Android la mostraría como aviso común y el handler de la app no correría.
    expect(sent.notification).toBeUndefined();
    expect(sent.android).toEqual({ priority: 'high', ttl: 120000 });
    expect(sent.data).toMatchObject({ type: 'request_new', jobId: 'job', title: 'Chamba', body: 'Oferta' });
    expect(sent.apns.payload.aps).toMatchObject({ sound: 'chamba_ringtone.mp3', 'interruption-level': 'time-sensitive' });
  });
  it('other events keep the system notification grouped by job', async () => {
    messaging.sendEachForMulticast.mockResolvedValue({ successCount: 1, responses: [{ success: true }] });
    await service.sendToTokens({ ...message, data: { type: 'job_cancelled', requestId: 'job' } });
    const sent = messaging.sendEachForMulticast.mock.calls[0][0];
    expect(sent.notification).toEqual({ title: 'Chamba', body: 'Oferta' });
    expect(sent.android.notification).toMatchObject({ channelId: 'chamba_default_channel', tag: 'job:job' });
  });
});
