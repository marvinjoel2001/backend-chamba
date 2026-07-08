import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MobileOffersService } from '../../mobile/services/mobile-offers.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { SendOfferDto } from '../dto/send-offer.dto';

@Injectable()
export class AgencyService {
  private readonly logger = new Logger(AgencyService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly mobileOffersService: MobileOffersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ── Trabajadores ────────────────────────────────────────────────

  public async getWorkers(agencyId: string, search?: string) {
    const term = search?.trim() ? `%${search.trim()}%` : null;

    const rows = await this.dataSource.query<any[]>(
      `
      WITH skill_agg AS (
        SELECT ws.user_id, array_agg(ws.skill ORDER BY ws.skill) AS skills
        FROM worker_skills ws
        GROUP BY ws.user_id
      ),
      active_jobs AS (
        SELECT jo.worker_user_id, COUNT(*) AS active_count
        FROM job_offers jo
        JOIN job_requests jr ON jr.id = jo.request_id
        WHERE jo.status = 'accepted'
          AND jr.status NOT IN ('completed', 'cancelled')
        GROUP BY jo.worker_user_id
      )
      SELECT u.id,
             u.first_name,
             u.last_name,
             u.email,
             u.phone,
             u.profile_photo_url,
             u.verification_status,
             u.is_available,
             u.is_blocked,
             u.average_rating,
             u.completed_jobs,
             sa.skills,
             COALESCE(aj.active_count, 0) AS active_jobs_count,
             ST_Y(u.current_location::geometry) AS latitude,
             ST_X(u.current_location::geometry) AS longitude
      FROM users u
      LEFT JOIN skill_agg sa ON sa.user_id = u.id
      LEFT JOIN active_jobs aj ON aj.worker_user_id = u.id
      WHERE u.agency_id = $1
        AND u.is_agency_worker = true
        AND u.type = 'worker'
        AND (
          $2::text IS NULL
          OR u.first_name ILIKE $2
          OR u.last_name ILIKE $2
          OR u.email ILIKE $2
          OR EXISTS (
            SELECT 1 FROM worker_skills ws2
            WHERE ws2.user_id = u.id AND ws2.skill ILIKE $2
          )
        )
      ORDER BY u.first_name ASC, u.last_name ASC
      `,
      [agencyId, term],
    );

    return rows.map((row) => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name ?? '',
      email: row.email,
      phone: row.phone ?? null,
      profilePhotoUrl: row.profile_photo_url ?? null,
      verificationStatus: row.verification_status ?? 'not_verified',
      isAvailable: row.is_available === true,
      isBlocked: row.is_blocked === true,
      averageRating: Number(row.average_rating ?? 0),
      completedJobs: Number(row.completed_jobs ?? 0),
      skills: row.skills ?? [],
      activeJobsCount: Number(row.active_jobs_count ?? 0),
      latitude: row.latitude == null ? null : Number(row.latitude),
      longitude: row.longitude == null ? null : Number(row.longitude),
    }));
  }

  public async linkWorker(agencyId: string, email: string) {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT id, type, agency_id, is_agency_worker, first_name, last_name, email
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
      `,
      [email],
    );

    const user = rows[0];
    if (!user || user.type !== 'worker') {
      throw new NotFoundException(
        'No existe un trabajador registrado con ese email',
      );
    }
    if (user.agency_id && user.agency_id !== agencyId) {
      throw new ConflictException(
        'El trabajador ya pertenece a otra agencia',
      );
    }

    await this.dataSource.query(
      `
      UPDATE users
      SET agency_id = $1,
          is_agency_worker = true,
          updated_at = NOW()
      WHERE id = $2
      `,
      [agencyId, user.id],
    );

    this.logger.log(
      `[linkWorker] Agencia ${agencyId} vinculó al trabajador ${user.id}`,
    );

    const workers = await this.getWorkers(agencyId);
    return workers.find((worker) => worker.id === user.id) ?? null;
  }

  public async unlinkWorker(agencyId: string, workerUserId: string) {
    // Para UPDATE ... RETURNING, dataSource.query devuelve [rows, affected].
    const [rows] = await this.dataSource.query<[any[], number]>(
      `
      UPDATE users
      SET agency_id = NULL,
          is_agency_worker = false,
          updated_at = NOW()
      WHERE id = $1
        AND agency_id = $2
        AND is_agency_worker = true
      RETURNING id
      `,
      [workerUserId, agencyId],
    );

    if (!rows[0]) {
      throw new NotFoundException('El trabajador no pertenece a tu agencia');
    }

    this.logger.log(
      `[unlinkWorker] Agencia ${agencyId} desvinculó al trabajador ${workerUserId}`,
    );

    return { unlinked: true, workerUserId };
  }

  public async toggleWorkerBlock(agencyId: string, workerUserId: string) {
    const [rows] = await this.dataSource.query<[any[], number]>(
      `
      UPDATE users
      SET is_blocked = NOT COALESCE(is_blocked, false),
          updated_at = NOW()
      WHERE id = $1
        AND agency_id = $2
        AND is_agency_worker = true
      RETURNING id, is_blocked
      `,
      [workerUserId, agencyId],
    );

    if (!rows[0]) {
      throw new NotFoundException('El trabajador no pertenece a tu agencia');
    }

    const isBlocked = rows[0].is_blocked;
    this.logger.log(
      `[toggleWorkerBlock] Agencia ${agencyId} ${isBlocked ? 'bloqueó' : 'desbloqueó'} al trabajador ${workerUserId}`,
    );

    return { blocked: isBlocked, workerUserId };
  }

  // ── Trabajos activos (mapa) ─────────────────────────────────────

  public async getActiveJobs(
    agencyId: string,
    params: { lat?: number; lng?: number; radiusKm?: number } = {},
  ) {
    const hasOrigin =
      Number.isFinite(params.lat) && Number.isFinite(params.lng);
    const radiusKm = Number.isFinite(params.radiusKm)
      ? Math.min(100, Math.max(0.5, params.radiusKm as number))
      : null;

    const rows = await this.dataSource.query<any[]>(
      `
      WITH origin AS (
        SELECT CASE
                 WHEN $2::float8 IS NOT NULL AND $3::float8 IS NOT NULL
                   THEN ST_SetSRID(ST_MakePoint($3::float8, $2::float8), 4326)::geography
                 ELSE NULL
               END AS point
      )
      SELECT jr.id,
             jr.title,
             jr.description,
             jr.category,
             jr.budget,
             jr.price_type,
             jr.address,
             jr.status,
             jr.created_at,
             jr.scheduled_at,
             ST_Y(jr.location::geometry) AS latitude,
             ST_X(jr.location::geometry) AS longitude,
             CASE
               WHEN origin.point IS NOT NULL
                 THEN ST_Distance(jr.location, origin.point) / 1000.0
               ELSE NULL
             END AS distance_km,
             (
               SELECT COUNT(*)
               FROM job_offers jo
               WHERE jo.request_id = jr.id AND jo.status = 'pending'
             ) AS pending_offers_count,
             (
               SELECT jo.status
               FROM job_offers jo
               WHERE jo.request_id = jr.id AND jo.offered_by_agency_id = $1
               ORDER BY jo.created_at DESC
               LIMIT 1
             ) AS my_offer_status
      FROM job_requests jr
      CROSS JOIN origin
      WHERE jr.status IN ('searching', 'negotiating')
        AND (
          origin.point IS NULL
          OR $4::float8 IS NULL
          OR ST_DWithin(jr.location, origin.point, $4::float8 * 1000)
        )
      ORDER BY jr.created_at DESC
      LIMIT 100
      `,
      [
        agencyId,
        hasOrigin ? params.lat : null,
        hasOrigin ? params.lng : null,
        radiusKm,
      ],
    );

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      budget: Number(row.budget),
      priceType: row.price_type,
      address: row.address,
      status: row.status,
      createdAt: row.created_at,
      scheduledAt: row.scheduled_at ?? null,
      latitude: row.latitude == null ? null : Number(row.latitude),
      longitude: row.longitude == null ? null : Number(row.longitude),
      distanceKm: row.distance_km == null ? null : Number(row.distance_km),
      pendingOffersCount: Number(row.pending_offers_count ?? 0),
      myOfferStatus: row.my_offer_status ?? null,
    }));
  }

  // ── Trabajos asignados (ofertas aceptadas) ─────────────────────

  public async getAssignedJobs(agencyId: string) {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT jr.id AS request_id,
             jr.title,
             jr.category,
             jr.address,
             jr.status AS request_status,
             jr.scheduled_at,
             jr.completed_at,
             jr.work_started_at,
             jr.updated_at,
             jo.id AS offer_id,
             jo.amount,
             jo.created_at AS offered_at,
             u.id AS worker_id,
             u.first_name,
             u.last_name,
             u.profile_photo_url,
             c.first_name AS client_first_name,
             c.last_name AS client_last_name
      FROM job_offers jo
      JOIN job_requests jr ON jr.id = jo.request_id
      JOIN users u ON u.id = jo.worker_user_id
      JOIN users c ON c.id = jr.client_user_id
      WHERE jo.offered_by_agency_id = $1
        AND jo.status = 'accepted'
      ORDER BY jr.updated_at DESC
      LIMIT 100
      `,
      [agencyId],
    );

    return rows.map((row) => ({
      requestId: row.request_id,
      offerId: row.offer_id,
      title: row.title,
      category: row.category,
      address: row.address,
      status: row.request_status,
      amount: Number(row.amount),
      scheduledAt: row.scheduled_at ?? null,
      workStartedAt: row.work_started_at ?? null,
      completedAt: row.completed_at ?? null,
      updatedAt: row.updated_at,
      offeredAt: row.offered_at,
      worker: {
        id: row.worker_id,
        name: `${row.first_name} ${row.last_name ?? ''}`.trim(),
        profilePhotoUrl: row.profile_photo_url ?? null,
      },
      clientName:
        `${row.client_first_name} ${row.client_last_name ?? ''}`.trim(),
    }));
  }

  // ── Envío de ofertas en nombre de un trabajador ────────────────

  public async sendOffer(
    agencyId: string,
    requestId: string,
    dto: SendOfferDto,
  ) {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT id, is_available, is_blocked
      FROM users
      WHERE id = $1
        AND agency_id = $2
        AND is_agency_worker = true
        AND type = 'worker'
      LIMIT 1
      `,
      [dto.workerUserId, agencyId],
    );

    const worker = rows[0];
    if (!worker) {
      throw new NotFoundException('El trabajador no pertenece a tu agencia');
    }
    if (worker.is_blocked === true) {
      throw new BadRequestException('El trabajador está bloqueado');
    }

    // Se delega en el flujo P2P existente: crea/actualiza la oferta,
    // abre el chat y notifica por realtime, marcando offered_by_agency_id.
    const result = await this.mobileOffersService.upsertOffer({
      requestId,
      workerUserId: dto.workerUserId,
      amount: Number(dto.amount),
      message: dto.message,
      offeredByAgencyId: agencyId,
    });

    this.notifyWorkerOfAgencyOffer(agencyId, requestId, dto).catch((err) =>
      this.logger.warn(
        `No se pudo notificar al trabajador ${dto.workerUserId}: ${err.message}`,
      ),
    );

    this.logger.log(
      `[sendOffer] Agencia ${agencyId} ofertó con el trabajador ${dto.workerUserId} en solicitud ${requestId}`,
    );

    return result;
  }

  private async notifyWorkerOfAgencyOffer(
    agencyId: string,
    requestId: string,
    dto: SendOfferDto,
  ): Promise<void> {
    const [meta] = await this.dataSource.query<any[]>(
      `
      SELECT a.name AS agency_name,
             jr.title AS job_title,
             (SELECT token FROM push_tokens
              WHERE user_id = $2
              ORDER BY last_seen_at DESC LIMIT 1) AS push_token
      FROM agencies a, job_requests jr
      WHERE a.id = $1 AND jr.id = $3
      `,
      [agencyId, dto.workerUserId, requestId],
    );
    if (!meta) return;

    await this.notificationsService.notifyWorkerAgencyOffer({
      userId: dto.workerUserId,
      token: meta.push_token ?? null,
      agencyName: meta.agency_name,
      amount: Number(dto.amount),
      jobTitle: meta.job_title,
      requestId,
    });
  }

  // ── Dashboard ──────────────────────────────────────────────────

  public async getDashboard(agencyId: string) {
    const [stats] = await this.dataSource.query<any[]>(
      `
      SELECT
        (SELECT COUNT(*) FROM users u
         WHERE u.agency_id = $1 AND u.is_agency_worker = true AND u.type = 'worker') AS total_workers,
        (SELECT COUNT(*) FROM users u
         WHERE u.agency_id = $1 AND u.is_agency_worker = true AND u.type = 'worker'
           AND u.is_available = true) AS available_workers,
        (SELECT COUNT(*) FROM job_offers jo
         WHERE jo.offered_by_agency_id = $1
           AND jo.created_at >= date_trunc('month', NOW())) AS offers_sent_month,
        (SELECT COUNT(*) FROM job_offers jo
         WHERE jo.offered_by_agency_id = $1
           AND jo.status = 'accepted'
           AND jo.created_at >= date_trunc('month', NOW())) AS offers_accepted_month,
        (SELECT COALESCE(SUM(jo.amount), 0) FROM job_offers jo
         JOIN job_requests jr ON jr.id = jo.request_id
         WHERE jo.offered_by_agency_id = $1
           AND jo.status = 'accepted'
           AND jr.status = 'completed'
           AND jr.completed_at >= date_trunc('month', NOW())) AS revenue_month,
        (SELECT COALESCE(AVG(NULLIF(u.average_rating, 0)), 0) FROM users u
         WHERE u.agency_id = $1 AND u.is_agency_worker = true AND u.type = 'worker') AS avg_rating,
        (SELECT a.commission_rate FROM agencies a WHERE a.id = $1) AS commission_rate
      `,
      [agencyId],
    );

    const recentActivity = await this.dataSource.query<any[]>(
      `
      SELECT jo.id AS offer_id,
             jo.status AS offer_status,
             jo.amount,
             jo.created_at,
             jr.title AS request_title,
             jr.status AS request_status,
             u.first_name,
             u.last_name
      FROM job_offers jo
      JOIN job_requests jr ON jr.id = jo.request_id
      JOIN users u ON u.id = jo.worker_user_id
      WHERE jo.offered_by_agency_id = $1
      ORDER BY jo.created_at DESC
      LIMIT 10
      `,
      [agencyId],
    );

    const topWorkers = await this.dataSource.query<any[]>(
      `
      SELECT u.id, u.first_name, u.last_name, u.profile_photo_url,
             u.average_rating, u.completed_jobs
      FROM users u
      WHERE u.agency_id = $1 AND u.is_agency_worker = true AND u.type = 'worker'
      ORDER BY u.average_rating DESC, u.completed_jobs DESC
      LIMIT 5
      `,
      [agencyId],
    );

    const revenueMonth = Number(stats?.revenue_month ?? 0);
    const commissionRate = Number(stats?.commission_rate ?? 0);

    return {
      stats: {
        totalWorkers: Number(stats?.total_workers ?? 0),
        availableWorkers: Number(stats?.available_workers ?? 0),
        offersSentMonth: Number(stats?.offers_sent_month ?? 0),
        offersAcceptedMonth: Number(stats?.offers_accepted_month ?? 0),
        revenueMonth,
        commissionRate,
        commissionMonth: Number(((revenueMonth * commissionRate) / 100).toFixed(2)),
        averageRating: Number(Number(stats?.avg_rating ?? 0).toFixed(2)),
      },
      recentActivity: recentActivity.map((row) => ({
        offerId: row.offer_id,
        offerStatus: row.offer_status,
        amount: Number(row.amount),
        createdAt: row.created_at,
        requestTitle: row.request_title,
        requestStatus: row.request_status,
        workerName: `${row.first_name} ${row.last_name ?? ''}`.trim(),
      })),
      topWorkers: topWorkers.map((row) => ({
        id: row.id,
        name: `${row.first_name} ${row.last_name ?? ''}`.trim(),
        profilePhotoUrl: row.profile_photo_url ?? null,
        averageRating: Number(row.average_rating ?? 0),
        completedJobs: Number(row.completed_jobs ?? 0),
      })),
    };
  }
}
