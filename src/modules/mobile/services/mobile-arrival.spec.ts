import { MobileRequestsService } from './mobile-requests.service';

describe('Arrival confirmation is idempotent', () => {
  it('a duplicate confirmation preserves the first work start and emits no second event', async () => {
    const query = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'job' }]);
    const realtime = { emitToUser: jest.fn() };
    const service = new MobileRequestsService({ query } as any, {} as any, {} as any, {} as any, realtime as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    await expect(service.clientConfirmArrival({ requestId: 'job', clientUserId: 'client' })).resolves.toEqual({ requestId: 'job', clientConfirmedArrival: true });
    expect(query.mock.calls[0][0]).toContain('COALESCE(work_started_at, NOW())');
    expect(query.mock.calls[0][0]).toContain('client_confirmed_arrival = false');
    expect(realtime.emitToUser).not.toHaveBeenCalled();
  });
  it('a cancelled job cannot be restarted', async () => {
    const service = new MobileRequestsService({ query: jest.fn().mockResolvedValue([]) } as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    await expect(service.clientConfirmArrival({ requestId: 'job', clientUserId: 'client' })).rejects.toThrow('No se puede confirmar');
  });
});
