import { MobileUsersService } from './mobile-users.service';

describe('MobileUsersService locations', () => {
  const row = { id: 'worker', latitude: -17.8, longitude: -63.18 };
  const query = jest.fn();
  const gateway = { emitToAdmins: jest.fn(), emitToUser: jest.fn(), broadcastClientLocationUpdated: jest.fn() };
  const service = new MobileUsersService({ query } as any, {} as any, gateway as any, {} as any, {} as any, {} as any);
  beforeEach(() => jest.clearAllMocks());
  it('unwraps PostgreSQL UPDATE rows and sends finite coordinates to the assigned client', async () => {
    query.mockResolvedValueOnce([[row], 1]).mockResolvedValueOnce([{client_user_id:'client'}]);
    const result = await service.updateWorkerLocation({workerUserId:'worker',latitude:-17.8,longitude:-63.18});
    expect(result).toMatchObject({workerId:'worker',latitude:-17.8,longitude:-63.18});
    expect(gateway.emitToUser).toHaveBeenCalledWith('client','worker.location.updated',result);
  });
  it('unwraps client location rows including zero coordinates', async () => {
    query.mockResolvedValueOnce([[{id:'client',latitude:0,longitude:0}],1]);
    const result = await service.updateClientLocation({clientUserId:'client',latitude:0,longitude:0});
    expect(result).toMatchObject({clientId:'client',latitude:0,longitude:0});
  });
  it('rejects coordinates outside geographic bounds before writing', async () => {
    await expect(service.updateWorkerLocation({workerUserId:'worker',latitude:91,longitude:0})).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
  it('returns not found for an empty UPDATE result', async () => {
    query.mockResolvedValueOnce([[],0]);
    await expect(service.updateWorkerLocation({workerUserId:'missing',latitude:0,longitude:0})).rejects.toThrow('Worker not found');
  });
});
