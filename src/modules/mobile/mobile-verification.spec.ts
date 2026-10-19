import { MobileController } from './mobile.controller';
import { MobileService } from './mobile.service';
import { MobileAccessGuard } from '../access/mobile-access.guard';

describe('Verification synchronization', () => {
  it('reads the authenticated account instead of a supplied user id', async () => {
    const getMyVerification = jest.fn().mockResolvedValue({ user: { id: 'worker' } });
    const controller = new MobileController({ getMyVerification } as any,
      {} as any, {} as any, {} as any, {} as any);
    await controller.getMyVerification({ principal: { id: 'worker' },
      query: { userId: 'someone-else' } });
    expect(getMyVerification).toHaveBeenCalledWith('worker');
  });

  it('requires a valid mobile session for verification refresh', async () => {
    const authenticate = jest.fn().mockRejectedValue(new Error('Unauthorized'));
    const guard = new MobileAccessGuard({ authenticate } as any);
    await expect(guard.canActivate({
      getHandler: () => ({ name: 'getMyVerification' }),
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    } as any)).rejects.toThrow('Unauthorized');
  });

  it('returns the latest database decision and only verification fields', async () => {
    const repo = { getUserById: jest.fn() };
    const args: any[] = Array(15).fill({});
    args[5] = repo;
    const service = new MobileService(...args as ConstructorParameters<typeof MobileService>);
    repo.getUserById.mockResolvedValue({ id: 'worker', verificationStatus: 'pending',
      idPhotoVerified: null, facePhotoVerified: null, password: 'private' });
    expect((await service.getMyVerification('worker')).user.verificationStatus).toBe('pending');
    repo.getUserById.mockResolvedValue({ id: 'worker', verificationStatus: 'verified',
      idPhotoVerified: true, facePhotoVerified: true, password: 'private' });
    const response = await service.getMyVerification('worker');
    expect(response.user).toMatchObject({ id: 'worker', verificationStatus: 'verified',
      idPhotoVerified: true, facePhotoVerified: true });
    expect(response.user).not.toHaveProperty('password');
    expect(repo.getUserById).toHaveBeenLastCalledWith('worker');
  });
});
