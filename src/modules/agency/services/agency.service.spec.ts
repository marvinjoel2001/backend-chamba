import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AgencyService } from './agency.service';
import { MobileOffersService } from '../../mobile/services/mobile-offers.service';
import { NotificationsService } from '../../notifications/notifications.service';

describe('AgencyService', () => {
  let service: AgencyService;
  let dataSource: { query: jest.Mock };
  let mobileOffersService: { upsertOffer: jest.Mock };
  let notificationsService: { notifyWorkerAgencyOffer: jest.Mock };

  const AGENCY_ID = 'a0000000-0000-0000-0000-000000000001';
  const WORKER_ID = 'b0000000-0000-0000-0000-000000000002';
  const REQUEST_ID = 'c0000000-0000-0000-0000-000000000003';

  beforeEach(async () => {
    dataSource = { query: jest.fn() };
    mobileOffersService = { upsertOffer: jest.fn() };
    notificationsService = { notifyWorkerAgencyOffer: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AgencyService,
        { provide: DataSource, useValue: dataSource },
        { provide: MobileOffersService, useValue: mobileOffersService },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = moduleRef.get(AgencyService);
  });

  describe('sendOffer', () => {
    const dto = { workerUserId: WORKER_ID, amount: 100, message: 'hola' };

    it('rechaza si el trabajador no pertenece a la agencia', async () => {
      dataSource.query.mockResolvedValueOnce([]);

      await expect(
        service.sendOffer(AGENCY_ID, REQUEST_ID, dto),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mobileOffersService.upsertOffer).not.toHaveBeenCalled();
    });

    it('rechaza si el trabajador está bloqueado', async () => {
      dataSource.query.mockResolvedValueOnce([
        { id: WORKER_ID, is_available: true, is_blocked: true },
      ]);

      await expect(
        service.sendOffer(AGENCY_ID, REQUEST_ID, dto),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mobileOffersService.upsertOffer).not.toHaveBeenCalled();
    });

    it('delega en upsertOffer marcando offered_by_agency_id y notifica al worker', async () => {
      dataSource.query
        // validación de pertenencia del worker
        .mockResolvedValueOnce([
          { id: WORKER_ID, is_available: true, is_blocked: false },
        ])
        // metadata para la notificación push
        .mockResolvedValueOnce([
          {
            agency_name: 'Agencia Demo',
            job_title: 'Limpieza',
            push_token: 'tok-123',
          },
        ]);
      mobileOffersService.upsertOffer.mockResolvedValueOnce({ ok: true });
      notificationsService.notifyWorkerAgencyOffer.mockResolvedValueOnce(null);

      const result = await service.sendOffer(AGENCY_ID, REQUEST_ID, dto);

      expect(result).toEqual({ ok: true });
      expect(mobileOffersService.upsertOffer).toHaveBeenCalledWith({
        requestId: REQUEST_ID,
        workerUserId: WORKER_ID,
        amount: 100,
        message: 'hola',
        offeredByAgencyId: AGENCY_ID,
      });

      // la notificación es fire-and-forget: dar un tick al event loop
      await new Promise((resolve) => setImmediate(resolve));
      expect(notificationsService.notifyWorkerAgencyOffer).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: WORKER_ID,
          agencyName: 'Agencia Demo',
          jobTitle: 'Limpieza',
          token: 'tok-123',
          amount: 100,
          requestId: REQUEST_ID,
        }),
      );
    });

    it('no falla la oferta si la notificación revienta', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          { id: WORKER_ID, is_available: true, is_blocked: false },
        ])
        .mockRejectedValueOnce(new Error('db down'));
      mobileOffersService.upsertOffer.mockResolvedValueOnce({ ok: true });

      await expect(
        service.sendOffer(AGENCY_ID, REQUEST_ID, dto),
      ).resolves.toEqual({ ok: true });
    });
  });

  describe('unlinkWorker', () => {
    // dataSource.query devuelve [rows, affected] para UPDATE ... RETURNING.
    it('rechaza si el trabajador no pertenece a la agencia', async () => {
      dataSource.query.mockResolvedValueOnce([[], 0]);

      await expect(
        service.unlinkWorker(AGENCY_ID, WORKER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('desvincula y devuelve confirmación', async () => {
      dataSource.query.mockResolvedValueOnce([[{ id: WORKER_ID }], 1]);

      await expect(service.unlinkWorker(AGENCY_ID, WORKER_ID)).resolves.toEqual(
        { unlinked: true, workerUserId: WORKER_ID },
      );
    });
  });

  describe('getDashboard', () => {
    it('calcula la comisión del mes a partir del commission_rate', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          {
            total_workers: '3',
            available_workers: '2',
            offers_sent_month: '5',
            offers_accepted_month: '2',
            revenue_month: '1000',
            avg_rating: '4.5',
            commission_rate: '10',
          },
        ])
        .mockResolvedValueOnce([]) // recentActivity
        .mockResolvedValueOnce([]); // topWorkers

      const result = await service.getDashboard(AGENCY_ID);

      expect(result.stats).toMatchObject({
        totalWorkers: 3,
        availableWorkers: 2,
        offersSentMonth: 5,
        offersAcceptedMonth: 2,
        revenueMonth: 1000,
        commissionRate: 10,
        commissionMonth: 100,
        averageRating: 4.5,
      });
    });
  });
});
