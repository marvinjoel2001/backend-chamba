import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../../notifications/notifications.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { MobileRequestRepository } from '../shared/mobile-request.repository';

@Injectable()
export class MobileOffersService {
  private readonly logger = new Logger(MobileOffersService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeGateway: RealtimeGateway,
    public readonly repo: MobileRequestRepository,
  ) {}

  public async getOffers(params: {
    requestId?: string;
    clientUserId?: string;
  }) {
    const request = await this.repo.resolveRequest(params);
    const offerLifetimeSeconds = await this.repo.getOfferLifetimeSeconds(
      (request as any).priceType ?? (request as any).price_type,
    );
    await this.repo.expireStaleOffers(request.id);
    const photos = await this.repo.getRequestPhotos(request.id);

    const rows = await this.dataSource.query<any[]>(
      `
      WITH skill_agg AS (
        SELECT ws.user_id, array_agg(ws.skill ORDER BY ws.skill) AS skills
        FROM worker_skills ws
        GROUP BY ws.user_id
      )
      SELECT jo.id AS offer_id,
             jo.amount,
             jo.status,
             jo.expires_at,
             EXTRACT(EPOCH FROM (jo.expires_at - NOW())) AS seconds_left,
             jo.message,
             u.id AS worker_id,
             u.first_name,
             u.last_name,
             u.profile_photo_url,
             u.average_rating,
             u.completed_jobs,
             sa.skills,
             a.name AS agency_name,
             CASE
               WHEN u.current_location IS NOT NULL
                 THEN ST_Distance(u.current_location, jr.location) / 1000.0
               ELSE NULL
             END AS distance_km
      FROM job_offers jo
      JOIN users u ON u.id = jo.worker_user_id
      JOIN job_requests jr ON jr.id = jo.request_id
      LEFT JOIN skill_agg sa ON sa.user_id = u.id
      LEFT JOIN agencies a ON a.id = jo.offered_by_agency_id
      WHERE jo.request_id = $1
        AND jo.status = 'pending'
        AND (jo.expires_at IS NULL OR jo.expires_at > NOW())
        AND jo.worker_user_id <> $2
      ORDER BY jo.amount ASC, u.average_rating DESC
      `,
      [
        request.id,
        (request as any).clientUserId ?? (request as any).client_user_id,
      ],
    );

    // Trabajadores reales cercanos y disponibles, para que la pantalla de
    // "Buscando trabajadores" del cliente muestre sus fotos/ubicaciones en el
    // mapa en vez de la simulación con avatares ficticios.
    const nearbyWorkers = await this.getNearbyWorkersForRequest(request.id);

    return {
      request: {
        ...request,
        photos,
      },
      offers: rows.map((row) => ({
        id: row.offer_id,
        amount: Number(row.amount),
        status: row.status,
        expiresAt: row.expires_at ?? null,
        secondsRemaining:
          row.seconds_left == null
            ? null
            : Math.max(0, Math.floor(Number(row.seconds_left))),
        message: row.message ?? '',
        worker: {
          id: row.worker_id,
          firstName: row.first_name,
          lastName: row.last_name ?? '',
          profilePhotoUrl: row.profile_photo_url ?? null,
          averageRating: Number(row.average_rating ?? 0),
          completedJobs: Number(row.completed_jobs ?? 0),
          skills: row.skills ?? [],
          distanceKm: row.distance_km == null ? null : Number(row.distance_km),
        },
        agencyName: row.agency_name ?? null,
      })),
      nearbyWorkers,
      offerLifetimeSeconds,
    };
  }

  private async getNearbyWorkersForRequest(requestId: string): Promise<
    Array<{
      id: string;
      firstName: string;
      profilePhotoUrl: string | null;
      latitude: number;
      longitude: number;
      distanceKm: number;
    }>
  > {
    try {
      const radiusKm = await this.repo.getWorkerNotificationRadiusKm();
      const rows = await this.dataSource.query<any[]>(
        `
        SELECT u.id,
               u.first_name,
               u.profile_photo_url,
               ST_Y(u.current_location::geometry) AS latitude,
               ST_X(u.current_location::geometry) AS longitude,
               ST_Distance(u.current_location, jr.location) / 1000.0 AS distance_km
        FROM users u
        JOIN job_requests jr ON jr.id = $1
        WHERE u.type = 'worker'
          AND u.is_available = true
          AND u.is_blocked = false
          AND u.is_agency_worker = false
          AND u.current_location IS NOT NULL
          AND u.id <> jr.client_user_id
          AND ST_DWithin(u.current_location, jr.location, $2::float8 * 1000)
        ORDER BY distance_km ASC
        LIMIT 8
        `,
        [requestId, radiusKm],
      );

      return rows.map((row) => ({
        id: row.id,
        firstName: row.first_name,
        profilePhotoUrl: row.profile_photo_url ?? null,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        distanceKm: Number(row.distance_km ?? 0),
      }));
    } catch (error) {
      // La lista de cercanos es decorativa: nunca debe romper getOffers.
      this.logger.warn(
        `[getNearbyWorkersForRequest] fallo al buscar cercanos: ${(error as Error).message}`,
      );
      return [];
    }
  }

  public async upsertOffer(params: {
    requestId: string;
    workerUserId: string;
    amount: number;
    message?: string;
    offeredByAgencyId?: string;
  }) {
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
      throw new BadRequestException('amount must be greater than 0');
    }

    await this.repo.expireStaleOffers(params.requestId);
    await this.repo.getUserById(params.workerUserId);
    const request = await this.repo.getRequestById(params.requestId);
    const offerLifetimeSeconds = await this.repo.getOfferLifetimeSeconds(
      request.price_type,
    );
    if (!['searching', 'negotiating'].includes(request.status)) {
      throw new BadRequestException('La solicitud ya no admite nuevas ofertas');
    }

    const currentBudget = Number(request.budget);
    if (params.amount < currentBudget) {
      throw new BadRequestException(
        `Tu oferta (Bs ${params.amount}) no puede ser menor al precio actual del cliente (Bs ${currentBudget})`,
      );
    }

    const existingRows = await this.dataSource.query<any[]>(
      `
      SELECT id
      FROM job_offers
      WHERE request_id = $1 AND worker_user_id = $2
      LIMIT 1
      `,
      [params.requestId, params.workerUserId],
    );

    let offerId = '';

    if (existingRows[0]) {
      await this.dataSource.query(
        `
        UPDATE job_offers
        SET amount = $2,
            message = $3,
            status = 'pending',
            expires_at = NOW() + ($4::int * INTERVAL '1 second'),
            offered_by_agency_id = $5,
            created_at = NOW()
        WHERE id = $1
        `,
        [
          existingRows[0].id,
          params.amount,
          params.message ?? null,
          offerLifetimeSeconds,
          params.offeredByAgencyId ?? null,
        ],
      );
      offerId = existingRows[0].id;
    } else {
      const rows = await this.dataSource.query<any[]>(
        `
        INSERT INTO job_offers (request_id, worker_user_id, amount, message, status, expires_at, offered_by_agency_id)
        VALUES ($1, $2, $3, $4, 'pending', NOW() + ($5::int * INTERVAL '1 second'), $6)
        RETURNING id
        `,
        [
          params.requestId,
          params.workerUserId,
          params.amount,
          params.message ?? null,
          offerLifetimeSeconds,
          params.offeredByAgencyId ?? null,
        ],
      );
      offerId = rows[0].id;
    }

    await this.dataSource.query(
      `
      UPDATE job_requests
      SET status = CASE WHEN status = 'searching' THEN 'negotiating' ELSE status END,
          updated_at = NOW()
      WHERE id = $1
      `,
      [params.requestId],
    );
    this.realtimeGateway.server.emit('request.status.updated', {
      requestId: params.requestId,
      status: 'negotiating',
      timestamp: new Date().toISOString(),
    });

    await this.repo.ensureThreadAndInitialMessage({
      requestId: params.requestId,
      clientUserId: request.client_user_id,
      workerUserId: params.workerUserId,
      introMessage:
        params.message?.trim() ||
        `Hola, puedo ayudarte por Bs ${Math.round(params.amount)}. Estoy disponible.`,
    });

    const offerPayload = {
      id: offerId,
      requestId: params.requestId,
      workerUserId: params.workerUserId,
      clientUserId: request.client_user_id,
      amount: params.amount,
      message: params.message ?? '',
      status: 'pending',
      offerLifetimeSeconds,
      currentBudget,
    };
    this.realtimeGateway.emitToUser(
      request.client_user_id,
      'offer.new',
      offerPayload,
    );
    this.realtimeGateway.emitToUser(
      request.client_user_id,
      'offer.updated',
      offerPayload,
    );
    this.realtimeGateway.emitToUser(
      params.workerUserId,
      'offer.updated',
      offerPayload,
    );
    const otherWorkerRows = await this.dataSource.query<any[]>(
      `
      SELECT DISTINCT worker_user_id
      FROM job_offers
      WHERE request_id = $1
        AND worker_user_id <> $2
        AND status = 'pending'
        AND (expires_at IS NULL OR expires_at > NOW())
      `,
      [params.requestId, params.workerUserId],
    );
    for (const row of otherWorkerRows) {
      this.realtimeGateway.emitToUser(row.worker_user_id, 'offer.updated', {
        ...offerPayload,
        workerUserId: row.worker_user_id,
      });
    }

    this.notifyClientOfNewOffer(
      params.requestId,
      params.workerUserId,
      params.amount,
      request.title,
    ).catch((err) => {
      this.logger.warn(
        'Failed to send push notification for new offer:',
        err.message,
      );
    });

    return {
      offer: {
        id: offerId,
        requestId: params.requestId,
        workerUserId: params.workerUserId,
        amount: params.amount,
        message: params.message ?? '',
        status: 'pending',
      },
    };
  }

  private async notifyClientOfNewOffer(
    requestId: string,
    workerUserId: string,
    amount: number,
    jobTitle: string,
  ): Promise<void> {
    const workerRows = await this.dataSource.query<any[]>(
      `SELECT first_name, last_name FROM users WHERE id = $1`,
      [workerUserId],
    );
    const workerName = workerRows[0]
      ? `${workerRows[0].first_name} ${workerRows[0].last_name ?? ''}`.trim()
      : 'Un trabajador';

    const requestRows = await this.dataSource.query<any[]>(
      `SELECT client_user_id FROM job_requests WHERE id = $1`,
      [requestId],
    );
    if (!requestRows[0]) return;
    const clientUserId = requestRows[0].client_user_id;

    const tokenRows = await this.dataSource.query<any[]>(
      `SELECT token AS push_token FROM push_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1`,
      [clientUserId],
    );
    if (!tokenRows[0]?.push_token) return;

    await this.notificationsService.notifyClientNewOffer({
      userId: clientUserId,
      token: tokenRows[0].push_token,
      workerName,
      amount,
      jobTitle,
      requestId,
    });
  }

  public async acceptOffer(params: { offerId: string; clientUserId: string }) {
    await this.repo.expireStaleOffers();
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT jo.id,
             jo.request_id,
             jo.worker_user_id,
             jo.status AS offer_status,
             jr.client_user_id,
             jr.status AS request_status
      FROM job_offers jo
      JOIN job_requests jr ON jr.id = jo.request_id
      WHERE jo.id = $1
      LIMIT 1
      `,
      [params.offerId],
    );

    const offer = rows[0];
    if (!offer) {
      throw new NotFoundException('Offer not found');
    }

    if (offer.client_user_id !== params.clientUserId) {
      throw new UnauthorizedException(
        'Solo el cliente puede aceptar la oferta',
      );
    }

    if (!['searching', 'negotiating'].includes(offer.request_status)) {
      throw new BadRequestException(
        offer.request_status === 'cancelled'
          ? 'La solicitud fue cancelada y ya no admite aceptar ofertas'
          : 'La solicitud ya no admite aceptar ofertas',
      );
    }
    if (offer.offer_status !== 'pending') {
      throw new BadRequestException('La oferta ya no está disponible');
    }

    // Updates condicionados al estado actual para evitar carreras
    // (doble aceptación o aceptar mientras el cron/cliente cancela).
    const acceptedRows = await this.dataSource.query<any[]>(
      `
      UPDATE job_offers
      SET status = 'accepted'
      WHERE id = $1
        AND status = 'pending'
        AND (expires_at IS NULL OR expires_at > NOW())
      RETURNING id
      `,
      [params.offerId],
    );
    if (!acceptedRows[0]) {
      throw new BadRequestException('La oferta expiró o ya no está disponible');
    }

    const assignedRows = await this.dataSource.query<any[]>(
      `
      UPDATE job_requests
      SET status = 'assigned', updated_at = NOW()
      WHERE id = $1
        AND status IN ('searching', 'negotiating')
      RETURNING id
      `,
      [offer.request_id],
    );
    if (!assignedRows[0]) {
      await this.dataSource.query(
        `UPDATE job_offers SET status = 'pending' WHERE id = $1`,
        [params.offerId],
      );
      throw new BadRequestException(
        'La solicitud cambió de estado y ya no admite aceptar ofertas',
      );
    }

    const rejectedRows = await this.dataSource.query<any[]>(
      `
      UPDATE job_offers
      SET status = 'rejected'
      WHERE request_id = $1
        AND id <> $2
        AND status = 'pending'
      RETURNING id, worker_user_id
      `,
      [offer.request_id, params.offerId],
    );
    this.realtimeGateway.server.emit('request.status.updated', {
      requestId: offer.request_id,
      status: 'assigned',
      timestamp: new Date().toISOString(),
    });
    await this.dataSource.query(
      `UPDATE users SET is_available = false, updated_at = NOW() WHERE id = $1`,
      [offer.worker_user_id],
    );
    this.logger.log(
      `[acceptOffer] Worker ${offer.worker_user_id} marcado como no disponible (trabajo en curso)`,
    );

    const payload = {
      offerId: params.offerId,
      requestId: offer.request_id,
      clientUserId: offer.client_user_id,
      workerUserId: offer.worker_user_id,
      accepted: true,
    };
    this.realtimeGateway.emitToUser(
      offer.client_user_id,
      'offer.accepted',
      payload,
    );
    this.realtimeGateway.emitToUser(
      offer.worker_user_id,
      'offer.accepted',
      payload,
    );
    for (const rejected of rejectedRows) {
      this.realtimeGateway.emitToUser(
        rejected.worker_user_id,
        'offer.rejected',
        {
          offerId: rejected.id,
          requestId: offer.request_id,
          clientUserId: offer.client_user_id,
          workerUserId: rejected.worker_user_id,
          status: 'rejected',
          reason: 'selected_other_worker',
        },
      );
    }

    this.notifyWorkerOfAcceptedOffer(
      offer.request_id,
      offer.worker_user_id,
      params.clientUserId,
    ).catch((err) => {
      this.logger.warn(
        'Failed to send push notification for accepted offer:',
        err.message,
      );
    });

    if (rejectedRows.length > 0) {
      const requestRows = await this.dataSource.query<any[]>(
        `SELECT title FROM job_requests WHERE id = $1`,
        [offer.request_id],
      );
      const jobTitle = requestRows[0]?.title ?? 'un trabajo';
      for (const rejected of rejectedRows) {
        const tokenRows = await this.dataSource.query<any[]>(
          `SELECT token AS push_token FROM push_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1`,
          [rejected.worker_user_id],
        );
        this.notificationsService
          .notifyOfferRejected({
            userId: rejected.worker_user_id,
            token: tokenRows[0]?.push_token || null,
            jobTitle,
            requestId: offer.request_id,
          })
          .catch((e) =>
            this.logger.error('Failed to notify offer rejected', e),
          );
      }
    }

    return {
      accepted: true,
      requestId: offer.request_id,
      workerUserId: offer.worker_user_id,
    };
  }

  private async notifyWorkerOfAcceptedOffer(
    requestId: string,
    workerUserId: string,
    clientUserId: string,
  ): Promise<void> {
    const clientRows = await this.dataSource.query<any[]>(
      `SELECT first_name, last_name FROM users WHERE id = $1`,
      [clientUserId],
    );
    const clientName = clientRows[0]
      ? `${clientRows[0].first_name} ${clientRows[0].last_name ?? ''}`.trim()
      : 'Un cliente';

    const requestRows = await this.dataSource.query<any[]>(
      `SELECT title FROM job_requests WHERE id = $1`,
      [requestId],
    );
    const jobTitle = requestRows[0]?.title ?? 'tu trabajo';

    const tokenRows = await this.dataSource.query<any[]>(
      `SELECT token AS push_token FROM push_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1`,
      [workerUserId],
    );
    if (!tokenRows[0]?.push_token) return;

    await this.notificationsService.notifyWorkerOfferAccepted({
      userId: workerUserId,
      token: tokenRows[0].push_token,
      clientName,
      jobTitle,
      requestId,
    });
  }

  public async discardOffer(params: {
    requestId: string;
    workerUserId: string;
  }) {
    await this.dataSource.query(
      `
      UPDATE job_offers
      SET status = 'expired', expires_at = NOW()
      WHERE request_id = $1
        AND worker_user_id = $2
        AND status = 'pending'
      `,
      [params.requestId, params.workerUserId],
    );

    this.logger.log(
      `[discardOffer] Worker ${params.workerUserId} descartó su oferta en solicitud ${params.requestId}`,
    );

    return { discarded: true, requestId: params.requestId };
  }

  public async declineOffer(params: {
    requestId: string;
    workerUserId: string;
  }) {
    const request = await this.repo.getRequestById(params.requestId);

    const existingOffers = await this.dataSource.query<any[]>(
      `
      SELECT id
      FROM job_offers
      WHERE request_id = $1
        AND worker_user_id = $2
        AND status IN ('pending', 'active')
      `,
      [params.requestId, params.workerUserId],
    );

    if (existingOffers.length > 0) {
      await this.dataSource.query(
        `
        UPDATE job_offers
        SET status = 'declined', expires_at = NULL
        WHERE request_id = $1
          AND worker_user_id = $2
          AND status IN ('pending', 'active')
        `,
        [params.requestId, params.workerUserId],
      );
    }

    if (existingOffers.length === 0) {
      const budget = Number(request.budget ?? 0);
      await this.dataSource.query(
        `
        INSERT INTO job_offers (request_id, worker_user_id, amount, status, expires_at)
        VALUES ($1, $2, $3, 'declined', NULL)
        ON CONFLICT (request_id, worker_user_id) DO UPDATE
          SET status = 'declined', expires_at = NULL
        `,
        [params.requestId, params.workerUserId, budget],
      );
    }

    const payload = {
      requestId: params.requestId,
      workerUserId: params.workerUserId,
      clientUserId: request.client_user_id,
      status: 'declined',
    };
    this.realtimeGateway.emitToUser(
      params.workerUserId,
      'offer.updated',
      payload,
    );
    this.realtimeGateway.emitToUser(
      request.client_user_id,
      'offer.updated',
      payload,
    );

    this.logger.log(
      `[declineOffer] Worker ${params.workerUserId} declinó solicitud ${params.requestId}`,
    );

    return { declined: true, requestId: params.requestId };
  }

  public async reactivateOffer(params: {
    requestId: string;
    workerUserId: string;
  }) {
    await this.dataSource.query(
      `
      UPDATE job_offers
      SET status = 'expired', expires_at = NULL
      WHERE request_id = $1
        AND worker_user_id = $2
        AND status = 'declined'
      `,
      [params.requestId, params.workerUserId],
    );

    this.logger.log(
      `[reactivateOffer] Worker ${params.workerUserId} reactivó solicitud ${params.requestId}`,
    );

    return { reactivated: true, requestId: params.requestId };
  }

  public async clientCounterOffer(params: {
    requestId: string;
    clientUserId: string;
    amount: number;
  }) {
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
      throw new BadRequestException('El monto debe ser mayor a 0');
    }

    const request = await this.repo.getRequestById(params.requestId);
    if (request.client_user_id !== params.clientUserId) {
      throw new UnauthorizedException('Solo el cliente puede contraofertar');
    }
    if (!['searching', 'negotiating'].includes(request.status)) {
      throw new BadRequestException('La solicitud ya no admite contraofertas');
    }

    const currentBudget = Number(request.budget);
    if (params.amount <= currentBudget) {
      throw new BadRequestException(
        `Tu nueva oferta (Bs ${params.amount}) debe ser mayor a tu oferta actual (Bs ${currentBudget})`,
      );
    }

    // La contraoferta del cliente es sobre el monto TOTAL. En modalidades por
    // hora/día se recalcula la tarifa para que tarifa × unidades = total y
    // todas las pantallas muestren números consistentes.
    const modality = (request.modality ?? 'fixed').toString();
    const estimatedHours = Number(request.estimatedHours) || 0;
    const days = Number(request.days) || 0;
    let extraSet = '';
    const updateParams: unknown[] = [params.requestId, params.amount];
    if (modality === 'hourly' && estimatedHours > 0) {
      extraSet = ', hourly_rate = $3';
      updateParams.push(
        Math.round((params.amount / estimatedHours) * 100) / 100,
      );
    } else if (modality === 'daily' && days > 0) {
      extraSet = ', daily_rate = $3';
      updateParams.push(Math.round((params.amount / days) * 100) / 100);
    }

    await this.dataSource.query(
      `UPDATE job_requests SET budget = $2${extraSet}, status = 'negotiating', updated_at = NOW() WHERE id = $1`,
      updateParams,
    );

    const workerRows = await this.dataSource.query<any[]>(
      `
      SELECT worker_user_id
      FROM job_offers
      WHERE request_id = $1
        AND status = 'pending'
      `,
      [params.requestId],
    );

    const payload = {
      requestId: params.requestId,
      newBudget: params.amount,
      clientUserId: params.clientUserId,
    };

    for (const row of workerRows) {
      this.realtimeGateway.emitToUser(
        row.worker_user_id,
        'offer.client_counter',
        payload,
      );
    }

    const client = await this.repo.getUserById(params.clientUserId);
    for (const row of workerRows) {
      const tokenRows = await this.dataSource.query<any[]>(
        `SELECT token AS push_token FROM push_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1`,
        [row.worker_user_id],
      );
      this.notificationsService
        .notifyWorkerCounterOffer({
          userId: row.worker_user_id,
          token: tokenRows[0]?.push_token || null,
          clientName: client.firstName,
          newAmount: params.amount,
          jobTitle: request.title,
          requestId: params.requestId,
        })
        .catch((e) => this.logger.error('Failed to notify counter offer', e));
    }

    this.logger.log(
      `[clientCounterOffer] Cliente ${params.clientUserId} contraofertó Bs ${params.amount} en solicitud ${params.requestId}`,
    );

    return { requestId: params.requestId, newBudget: params.amount };
  }
}
