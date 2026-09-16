import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { MobileOffersService } from './mobile-offers.service';

describe('MobileOffersService.acceptOffer', () => {
  let service: MobileOffersService;
  let dataSourceMock: any;
  let queryRunnerMock: any;
  let notificationsServiceMock: any;
  let realtimeGatewayMock: any;
  let repoMock: any;

  const CLIENT_ID = 'cli-00000000-0000-0000-0000-000000000001';
  const WORKER_ID = 'wor-00000000-0000-0000-0000-000000000002';
  const REQUEST_ID = 'req-00000000-0000-0000-0000-000000000003';
  const OFFER_ID = 'off-00000000-0000-0000-0000-000000000004';

  beforeEach(() => {
    queryRunnerMock = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(),
    };

    dataSourceMock = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunnerMock),
      query: jest.fn().mockResolvedValue([]),
    };

    notificationsServiceMock = {
      notifyWorkerAcceptedOffer: jest.fn().mockResolvedValue(undefined),
      notifyOfferRejected: jest.fn().mockResolvedValue(undefined),
    };

    realtimeGatewayMock = {
      server: { emit: jest.fn() },
      emitToUser: jest.fn(),
    };

    repoMock = {
      expireStaleOffers: jest.fn().mockResolvedValue(undefined),
    };

    service = new MobileOffersService(
      dataSourceMock as any,
      notificationsServiceMock as any,
      realtimeGatewayMock as any,
      repoMock as any,
    );
  });

  it('rechaza si la solicitud no existe', async () => {
    queryRunnerMock.query.mockResolvedValueOnce([]); // no request

    await expect(
      service.acceptOffer({ offerId: OFFER_ID, clientUserId: CLIENT_ID }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(queryRunnerMock.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunnerMock.release).toHaveBeenCalled();
    expect(queryRunnerMock.commitTransaction).not.toHaveBeenCalled();
  });

  it('rechaza si el usuario que llama no es el cliente de la solicitud', async () => {
    queryRunnerMock.query.mockResolvedValueOnce([
      { id: REQUEST_ID, client_user_id: 'other-client', status: 'searching', title: 'Plomería' },
    ]);

    await expect(
      service.acceptOffer({ offerId: OFFER_ID, clientUserId: CLIENT_ID }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(queryRunnerMock.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunnerMock.release).toHaveBeenCalled();
  });

  it('rechaza si la solicitud ya no admite ofertas (ej: ya asignada o cancelada)', async () => {
    queryRunnerMock.query.mockResolvedValueOnce([
      { id: REQUEST_ID, client_user_id: CLIENT_ID, status: 'assigned', title: 'Plomería' },
    ]);

    await expect(
      service.acceptOffer({ offerId: OFFER_ID, clientUserId: CLIENT_ID }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(queryRunnerMock.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunnerMock.release).toHaveBeenCalled();
  });

  it('rechaza si la oferta no existe o ya no está pending', async () => {
    queryRunnerMock.query
      .mockResolvedValueOnce([
        { id: REQUEST_ID, client_user_id: CLIENT_ID, status: 'searching', title: 'Plomería' },
      ])
      .mockResolvedValueOnce([
        { id: OFFER_ID, request_id: REQUEST_ID, worker_user_id: WORKER_ID, status: 'accepted', amount: 150 },
      ]);

    await expect(
      service.acceptOffer({ offerId: OFFER_ID, clientUserId: CLIENT_ID }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(queryRunnerMock.rollbackTransaction).toHaveBeenCalled();
  });

  it('rechaza si la oferta ya expiró por fecha', async () => {
    const expiredDate = new Date(Date.now() - 60000); // 1 minuto en el pasado
    queryRunnerMock.query
      .mockResolvedValueOnce([
        { id: REQUEST_ID, client_user_id: CLIENT_ID, status: 'searching', title: 'Plomería' },
      ])
      .mockResolvedValueOnce([
        { id: OFFER_ID, request_id: REQUEST_ID, worker_user_id: WORKER_ID, status: 'pending', amount: 150, expires_at: expiredDate },
      ]);

    await expect(
      service.acceptOffer({ offerId: OFFER_ID, clientUserId: CLIENT_ID }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(queryRunnerMock.rollbackTransaction).toHaveBeenCalled();
  });

  it('ejecuta transacción ACID completa con FOR UPDATE, commitea y emite eventos en tiempo real', async () => {
    const futureDate = new Date(Date.now() + 600000); // 10 min en el futuro
    queryRunnerMock.query
      // 1. SELECT request FOR UPDATE
      .mockResolvedValueOnce([
        { id: REQUEST_ID, client_user_id: CLIENT_ID, status: 'searching', title: 'Plomería' },
      ])
      // 2. SELECT offer FOR UPDATE
      .mockResolvedValueOnce([
        { id: OFFER_ID, request_id: REQUEST_ID, worker_user_id: WORKER_ID, status: 'pending', amount: 150, expires_at: futureDate },
      ])
      // 3. UPDATE job_offers accepted
      .mockResolvedValueOnce([{ id: OFFER_ID }])
      // 4. UPDATE job_requests assigned
      .mockResolvedValueOnce([{ id: REQUEST_ID }])
      // 5. UPDATE job_offers rejected (las demás)
      .mockResolvedValueOnce([
        { id: 'off-other', worker_user_id: 'wor-other' },
      ])
      // 6. UPDATE users is_available = false
      .mockResolvedValueOnce([]);

    const result = await service.acceptOffer({
      offerId: OFFER_ID,
      clientUserId: CLIENT_ID,
    });

    expect(result).toEqual({
      accepted: true,
      requestId: REQUEST_ID,
      workerUserId: WORKER_ID,
    });

    // Validar control de transacción
    expect(queryRunnerMock.startTransaction).toHaveBeenCalled();
    expect(queryRunnerMock.commitTransaction).toHaveBeenCalled();
    expect(queryRunnerMock.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunnerMock.release).toHaveBeenCalled();

    // Validar eventos Realtime después del commit
    expect(realtimeGatewayMock.server.emit).toHaveBeenCalledWith(
      'request.status.updated',
      expect.objectContaining({ requestId: REQUEST_ID, status: 'assigned' }),
    );
    expect(realtimeGatewayMock.emitToUser).toHaveBeenCalledWith(
      CLIENT_ID,
      'offer.accepted',
      expect.objectContaining({ offerId: OFFER_ID, accepted: true }),
    );
    expect(realtimeGatewayMock.emitToUser).toHaveBeenCalledWith(
      WORKER_ID,
      'offer.accepted',
      expect.objectContaining({ offerId: OFFER_ID, accepted: true }),
    );
    expect(realtimeGatewayMock.emitToUser).toHaveBeenCalledWith(
      'wor-other',
      'offer.rejected',
      expect.objectContaining({ status: 'rejected', reason: 'selected_other_worker' }),
    );
  });
});
