import { MobileRequestsService } from './mobile-requests.service';

describe('Arrival confirmation is idempotent', () => {
  it('delivers arrival confirmation without depending on a separate token query', async () => {
    const query = jest.fn().mockResolvedValueOnce([[{ id: 'job' }], 1]).mockResolvedValueOnce([{ worker_user_id: 'worker' }]);
    const notify = jest.fn().mockResolvedValue(null);
    const service = new MobileRequestsService({ query } as any, {} as any, {} as any,
      { notifyClientConfirmedArrival: notify } as any, { emitToUser: jest.fn() } as any, {} as any,
      { getUserById: async () => ({ firstName: 'Cliente' }), getRequestById: async () => ({ title: 'QA' }) } as any,
      {} as any, {} as any, {} as any, {} as any);
    await service.clientConfirmArrival({ requestId: 'job', clientUserId: 'client' });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'worker', token: null, requestId: 'job' }));
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('a duplicate confirmation preserves the first work start and emits no second event', async () => {
    const query = jest.fn().mockResolvedValueOnce([[], 0]).mockResolvedValueOnce([{ id: 'job' }]);
    const realtime = { emitToUser: jest.fn() };
    const service = new MobileRequestsService({ query } as any, {} as any, {} as any, {} as any, realtime as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    await expect(service.clientConfirmArrival({ requestId: 'job', clientUserId: 'client' })).resolves.toEqual({ requestId: 'job', clientConfirmedArrival: true });
    expect(query.mock.calls[0][0]).toContain('COALESCE(work_started_at, NOW())');
    expect(query.mock.calls[0][0]).toContain('client_confirmed_arrival = false');
    expect(realtime.emitToUser).not.toHaveBeenCalled();
  });
  it('a cancelled job cannot be restarted', async () => {
    const query = jest.fn().mockResolvedValueOnce([[], 0]).mockResolvedValueOnce([]);
    const service = new MobileRequestsService({ query } as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    await expect(service.clientConfirmArrival({ requestId: 'job', clientUserId: 'client' })).rejects.toThrow('No se puede confirmar');
  });
  it('rejects a pause that changed no row and sends no clock event', async () => {
    const realtime = { emitToUser: jest.fn() };
    const service = new MobileRequestsService({ query: jest.fn().mockResolvedValue([[], 0]) } as any,
      {} as any, {} as any, {} as any, realtime as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    await expect(service.setWorkPaused({ requestId: 'job', clientUserId: 'client', paused: true })).rejects.toThrow('Solo se puede pausar');
    expect(realtime.emitToUser).not.toHaveBeenCalled();
  });
  it('rejects completing a finished job and emits no repeated notification', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ id: 'job', client_confirmed_arrival: true }]).mockResolvedValueOnce([[], 0]);
    const realtime = { broadcastRequest: jest.fn(), emitToUser: jest.fn() };
    const service = new MobileRequestsService({ query } as any, {} as any, {} as any, {} as any,
      realtime as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    await expect(service.completeJob({ requestId: 'job', workerUserId: 'worker' })).rejects.toThrow('ya fue cancelado o completado');
    expect(realtime.broadcastRequest).not.toHaveBeenCalled();
  });
  it('returns the settled amount from PostgreSQL UPDATE instead of NaN', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ id: 'job', client_confirmed_arrival: true, client_user_id: 'client' }])
      .mockResolvedValueOnce([[{ id: 'job', settled_amount: '1.43' }], 1])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const realtime = { broadcastRequest: jest.fn(), emitToUser: jest.fn() };
    const service = new MobileRequestsService({ query } as any, {} as any, {} as any, {} as any,
      realtime as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    await expect(service.completeJob({ requestId: 'job', workerUserId: 'worker' })).resolves.toEqual({
      requestId: 'job', status: 'completed', amount: 1.43,
    });
  });
});
