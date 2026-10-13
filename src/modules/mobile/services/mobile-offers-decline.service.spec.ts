import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MobileOffersService } from './mobile-offers.service';

describe('MobileOffersService.declineOffer', () => {
  let service: MobileOffersService;
  let runner: any;
  let realtime: any;
  beforeEach(() => {
    runner = {
      isTransactionActive: true,
      connect: jest.fn(), startTransaction: jest.fn(), query: jest.fn(),
      commitTransaction: jest.fn(), rollbackTransaction: jest.fn(), release: jest.fn(),
    };
    realtime = { emitToUser: jest.fn() };
    service = new MobileOffersService(
      { createQueryRunner: () => runner } as any, {} as any, realtime, {} as any,
    );
  });
  const input = { requestId: 'request', workerUserId: 'worker' };

  it.each(['assigned', 'completed', 'cancelled', 'expired'])(
    'does not modify any offer after request becomes %s', async (status) => {
      runner.query.mockResolvedValueOnce([{ client_user_id: 'client', status, budget: 100 }]);
      await expect(service.declineOffer(input)).rejects.toBeInstanceOf(BadRequestException);
      expect(runner.query).toHaveBeenCalledTimes(1);
      expect(runner.query.mock.calls[0][0]).toContain('FOR UPDATE');
      expect(runner.rollbackTransaction).toHaveBeenCalled();
      expect(runner.commitTransaction).not.toHaveBeenCalled();
      expect(runner.release).toHaveBeenCalled();
      expect(realtime.emitToUser).not.toHaveBeenCalled();
    },
  );
  it('rejects a missing request without changing offers', async () => {
    runner.query.mockResolvedValueOnce([]);
    await expect(service.declineOffer(input)).rejects.toBeInstanceOf(NotFoundException);
    expect(runner.query).toHaveBeenCalledTimes(1);
  });
  it('leaves an accepted/rejected conflicting offer untouched even in a searching request', async () => {
    runner.query.mockResolvedValueOnce([{ client_user_id: 'client', status: 'searching', budget: 100 }])
      .mockResolvedValueOnce([]);
    await expect(service.declineOffer(input)).rejects.toBeInstanceOf(BadRequestException);
    const upsert = runner.query.mock.calls[1][0];
    expect(upsert).toContain("WHERE job_offers.status IN ('pending', 'active', 'expired', 'declined')");
    expect(runner.rollbackTransaction).toHaveBeenCalled();
    expect(realtime.emitToUser).not.toHaveBeenCalled();
  });
  it.each(['searching', 'negotiating'])('allows declining a pending or unseen request in %s', async (status) => {
    runner.query.mockResolvedValueOnce([{ client_user_id: 'client', status, budget: 100 }])
      .mockResolvedValueOnce([{ id: 'offer' }]);
    await expect(service.declineOffer(input)).resolves.toEqual({ declined: true, requestId: 'request' });
    expect(runner.commitTransaction).toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalled();
    expect(realtime.emitToUser).toHaveBeenCalledWith('client', 'offer.updated', expect.objectContaining({ status: 'declined' }));
    expect(runner.commitTransaction.mock.invocationCallOrder[0]).toBeLessThan(realtime.emitToUser.mock.invocationCallOrder[0]);
  });
});
