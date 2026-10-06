import { RealtimeGateway } from './realtime.gateway';
describe('Private realtime delivery', () => {
  let gateway: RealtimeGateway, server: any, access: any;
  beforeEach(() => {
    access = { canJoinUser: jest.fn().mockResolvedValue(false), assertThread: jest.fn().mockRejectedValue(new Error('forbidden')) };
    gateway = new RealtimeGateway(access, {} as any);
    server = { to: jest.fn().mockReturnThis(), emit: jest.fn(), in: jest.fn().mockReturnThis(), fetchSockets: jest.fn().mockResolvedValue([]) };
    gateway.server = server;
  });
  it('private messages are never sent to agency rooms', () => {
    gateway.emitToUser('worker', 'message.new', {});
    expect(server.to.mock.calls).toEqual([['user:worker']]);
  });
  it('agencies still receive their authorized worker job events', () => {
    gateway.emitToUser('worker', 'offer.accepted', {});
    expect(server.to.mock.calls).toEqual([['user:worker'], ['agency-worker:worker']]);
  });
  it('user creation and customer coordinates go only to admin rooms', () => {
    gateway.broadcastUserCreated({ id: 'user', email: 'x', firstName: 'X' });
    gateway.broadcastClientLocationUpdated('user', 1, 2, 'now');
    expect(server.to.mock.calls).toEqual([['admins'], ['admins']]);
  });
  it('rejects unauthorized room joins', async () => {
    const client = { data: { principal: { id: 'one', kind: 'mobile' } }, join: jest.fn() } as any;
    await expect(gateway.joinUser(client, { userId: 'other' })).rejects.toThrow();
    await expect(gateway.joinThread(client, { threadId: 'other' })).rejects.toThrow();
    expect(client.join).not.toHaveBeenCalled();
  });
  it('disconnected, hidden and stale devices never suppress push', async () => {
    const emitWithAck = jest.fn();
    server.fetchSockets.mockResolvedValue([{ data: { visible: false, pushToken: 'hidden', presenceAt: Date.now() }, timeout: () => ({ emitWithAck }) },
      { data: { visible: true, pushToken: 'stale', presenceAt: 1 }, timeout: () => ({ emitWithAck }) }]);
    expect(await gateway.presentNotification('user', {})).toEqual(new Set());
    expect(emitWithAck).not.toHaveBeenCalled();
  });
});
