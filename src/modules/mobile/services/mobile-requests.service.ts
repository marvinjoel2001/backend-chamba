import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { WaveDispatchQueueService } from '../../queues/wave-dispatch.queue.service';
import { MobileRequestRepository } from '../shared/mobile-request.repository';
import { MobileGeoHelpers } from '../shared/mobile-geo.helpers';
import { MobileCatalogService } from './mobile-catalog.service';
import { MobileOffersService } from './mobile-offers.service';
import { ApiLogsService } from '../../api-logs/api-logs.service';

type CreateRequestInput = {
  clientUserId: string;
  title: string;
  description: string;
  category?: string;
  aiCategories?: Array<{
    id: string;
    name: string;
    confidence: number;
  }>;
  budget: number;
  priceType: string;
  address: string;
  latitude: number;
  longitude: number;
  scheduledAt?: string;
  photosBase64?: string[];
  photos?: Array<{
    url: string;
    publicId: string;
  }>;
  paymentMethod?: string;
  modality?: string;
  estimatedHours?: number;
  hourlyRate?: number;
  days?: number;
  dailyRate?: number;
  startDate?: string;
};

@Injectable()
export class MobileRequestsService {
  private readonly logger = new Logger(MobileRequestsService.name);
  private static readonly DEFAULT_CATEGORY = 'General';
  private static readonly GEMINI_TIMEOUT_MS = 45000;
  private static readonly WORKER_NOTIFICATION_WAVE_SIZE = 5;
  private static readonly WORKER_NOTIFICATION_WAVE_DELAY_MS = 7000;

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly waveQueueService: WaveDispatchQueueService,
    private readonly repo: MobileRequestRepository,
    private readonly geoHelpers: MobileGeoHelpers,
    private readonly catalogService: MobileCatalogService,
    private readonly offersService: MobileOffersService,
    private readonly apiLogsService: ApiLogsService,
  ) {}

  public async getExploreData(params: {
    userId: string;
    latitude?: number;
    longitude?: number;
    radiusKm?: number;
  }) {
    const user = await this.repo.getUserById(params.userId);
    const radiusKm =
      params.radiusKm && params.radiusKm > 0 ? params.radiusKm : 8;

    const workerRows = await this.dataSource.query<any[]>(
      `
      WITH origin AS (
        SELECT
          CASE
            WHEN $2::float8 IS NOT NULL AND $3::float8 IS NOT NULL
              THEN ST_SetSRID(ST_MakePoint($3::float8, $2::float8), 4326)::geography
            ELSE u.current_location
          END AS point
        FROM users u
        WHERE u.id = $1
      ),
      worker_skill_agg AS (
        SELECT ws.user_id, array_agg(ws.skill ORDER BY ws.skill) AS skills
        FROM worker_skills ws
        GROUP BY ws.user_id
      )
      SELECT w.id,
             w.first_name,
             w.last_name,
             w.profile_photo_url,
             w.average_rating,
             w.completed_jobs,
             w.is_available,
             w.work_radius_km,
             ST_Y(w.current_location::geometry) AS latitude,
             ST_X(w.current_location::geometry) AS longitude,
             ST_Distance(w.current_location, origin.point) / 1000.0 AS distance_km,
             sa.skills
      FROM users w
      CROSS JOIN origin
      LEFT JOIN worker_skill_agg sa ON sa.user_id = w.id
      WHERE w.type = 'worker'
        AND w.is_available = true
        AND w.is_agency_worker = false
        AND w.current_location IS NOT NULL
        AND origin.point IS NOT NULL
        AND ST_DWithin(w.current_location, origin.point, $4::float8 * 1000)
      ORDER BY distance_km ASC
      LIMIT 30
      `,
      [
        params.userId,
        params.latitude ?? null,
        params.longitude ?? null,
        radiusKm,
      ],
    );

    const activeRequest = await this.repo.findLatestClientRequest(user.id);

    const topCategories = this.geoHelpers.extractTopCategories(workerRows);
    const categories =
      topCategories.length > 0
        ? topCategories
        : await this.catalogService.listFallbackCategories();

    return {
      user,
      categories,
      activeRequest,
      nearbyWorkers: workerRows.map((row) => ({
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name ?? '',
        profilePhotoUrl: row.profile_photo_url ?? null,
        averageRating: Number(row.average_rating ?? 0),
        completedJobs: Number(row.completed_jobs ?? 0),
        isAvailable: row.is_available,
        workRadiusKm: Number(row.work_radius_km ?? 0),
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        distanceKm: Number(row.distance_km ?? 0),
        skills: row.skills ?? [],
      })),
    };
  }

  public async previewRequestCategories(input: {
    title?: string;
    description: string;
    category?: string;
  }) {
    const description = input.description?.trim();
    if (!description) {
      throw new BadRequestException('description is required');
    }

    const fallbackCategory =
      input.category?.trim() || MobileRequestsService.DEFAULT_CATEGORY;
    const title = this.geoHelpers.buildRequestTitle({
      title: input.title,
      description,
      fallbackCategory,
    });

    const aiCategories = this.geoHelpers.normalizeAiCategories(
      await this.classifyRequestCategoriesWithAi({
        title,
        description,
        fallbackCategory,
      }),
      fallbackCategory,
    );

    return {
      title,
      category: aiCategories[0]?.name ?? fallbackCategory,
      aiCategories,
    };
  }

  public async createRequest(input: CreateRequestInput) {
    if (!input.clientUserId) {
      throw new BadRequestException('clientUserId is required');
    }
    if (!input.title || !input.description || !input.address) {
      throw new BadRequestException(
        'title, description and address are required',
      );
    }
    if (!Number.isFinite(input.budget) || input.budget <= 0) {
      throw new BadRequestException('budget must be greater than 0');
    }
    if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
      throw new BadRequestException('latitude and longitude are required');
    }
    const photos = this.geoHelpers.validateBase64Images(input.photosBase64, 5);
    const uploadedPhotosInput = this.geoHelpers.validateUploadedImages(
      input.photos,
      5,
    );
    const fallbackCategory =
      input.category?.trim() || MobileRequestsService.DEFAULT_CATEGORY;
    const aiCategoriesInput =
      Array.isArray(input.aiCategories) && input.aiCategories.length > 0
        ? input.aiCategories
        : await this.classifyRequestCategoriesWithAi({
            title: input.title,
            description: input.description,
            fallbackCategory,
          });
    const aiCategories = this.geoHelpers.normalizeAiCategories(
      aiCategoriesInput,
      fallbackCategory,
    );
    const primaryCategory =
      aiCategories[0]?.name ||
      fallbackCategory ||
      MobileRequestsService.DEFAULT_CATEGORY;
    await this.repo.ensureCategoriesExist([
      primaryCategory,
      ...aiCategories.map((item) => item.name),
    ]);

    await this.repo.getUserById(input.clientUserId);

    const rows = await this.dataSource.query<any[]>(
      `
      INSERT INTO job_requests (
        client_user_id,
        title,
        description,
        category,
        ai_categories,
        budget,
        price_type,
        scheduled_at,
        location,
        address,
        status,
        payment_method,
        modality,
        estimated_hours,
        hourly_rate,
        days,
        daily_rate,
        start_date
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5::jsonb,
        $6::numeric,
        $7,
        $8,
        ST_SetSRID(ST_MakePoint($10::float8, $9::float8), 4326)::geography,
        $11,
        'searching',
        $12,
        $13,
        $14,
        $15,
        $16,
        $17,
        $18
      )
      RETURNING id, status, title, budget, address, ai_categories, created_at, payment_method, modality, estimated_hours, hourly_rate, days, daily_rate, start_date
      `,
      [
        input.clientUserId,
        input.title,
        input.description,
        primaryCategory,
        JSON.stringify(aiCategories),
        input.budget,
        input.priceType,
        input.scheduledAt || null,
        input.latitude,
        input.longitude,
        input.address,
        input.paymentMethod || 'Efectivo',
        input.modality || null,
        input.estimatedHours || null,
        input.hourlyRate || null,
        input.days || null,
        input.dailyRate || null,
        input.startDate || null,
      ],
    );

    const created = rows[0];
    const uploadedPhotos =
      uploadedPhotosInput.length > 0
        ? await this.persistUploadedRequestPhotos(
            created.id,
            uploadedPhotosInput,
          )
        : await this.uploadRequestPhotos(created.id, photos);
    const notifiedWorkers = await this.seedOffersForRequest(
      created.id,
      input.budget,
    );

    this.realtimeGateway.server.emit('request.published', {
      requestId: created.id,
      status: created.status,
      title: created.title,
      budget: Number(created.budget),
      address: created.address,
      latitude: Number(input.latitude),
      longitude: Number(input.longitude),
      timestamp: new Date().toISOString(),
    });

    return {
      request: {
        id: created.id,
        status: created.status,
        title: created.title,
        budget: Number(created.budget),
        address: created.address,
        aiCategories: this.repo.parseAiCategories(created.ai_categories),
        createdAt: created.created_at,
        photos: uploadedPhotos,
      },
      notifiedWorkers,
    };
  }

  public async deleteRequestPhoto(params: {
    requestPhotoId: string;
    clientUserId: string;
  }) {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT p.id,
             p.public_id,
             p.request_id,
             jr.client_user_id
      FROM job_request_photos p
      JOIN job_requests jr ON jr.id = p.request_id
      WHERE p.id = $1
      LIMIT 1
      `,
      [params.requestPhotoId],
    );

    const photo = rows[0];
    if (!photo) {
      throw new NotFoundException('Request photo not found');
    }
    if (photo.client_user_id !== params.clientUserId) {
      throw new UnauthorizedException(
        'Only the request owner can delete photos',
      );
    }

    await this.dataSource.query(
      `DELETE FROM job_request_photos WHERE id = $1`,
      [params.requestPhotoId],
    );
    if (photo.public_id) {
      await this.storageService.deleteImage(photo.public_id);
    }

    return {
      deleted: true,
      requestPhotoId: params.requestPhotoId,
      requestId: photo.request_id,
    };
  }

  public async getRequestStatus(params: {
    requestId?: string;
    clientUserId?: string;
  }) {
    const request = await this.repo.resolveRequest(params);
    await this.repo.expireStaleOffers(request.id);
    const photos = await this.repo.getRequestPhotos(request.id);

    const metricRows = await this.dataSource.query<any[]>(
      `
      SELECT
        COUNT(*) FILTER (
          WHERE jo.status = 'pending'
            AND (jo.expires_at IS NULL OR jo.expires_at > NOW())
        )::text AS offers_count,
        COUNT(*) FILTER (
          WHERE jo.status = 'accepted'
        )::text AS accepted_count,
        MIN(
          CASE
            WHEN jo.status = 'pending'
                 AND (jo.expires_at IS NULL OR jo.expires_at > NOW())
                 AND u.current_location IS NOT NULL
              THEN ST_Distance(u.current_location, jr.location) / 1000.0
            ELSE NULL
          END
        ) AS nearest_worker_km
      FROM job_requests jr
      LEFT JOIN job_offers jo ON jo.request_id = jr.id
      LEFT JOIN users u ON u.id = jo.worker_user_id
      WHERE jr.id = $1
      `,
      [request.id],
    );

    const topOfferRows = await this.dataSource.query<any[]>(
      `
      SELECT jo.id,
             jo.amount,
             jo.status,
             u.id AS worker_id,
             u.first_name,
             u.last_name,
             u.average_rating,
             u.completed_jobs,
             a.name AS agency_name
      FROM job_offers jo
      JOIN users u ON u.id = jo.worker_user_id
      LEFT JOIN agencies a ON a.id = jo.offered_by_agency_id
      WHERE jo.request_id = $1
        AND jo.status = 'pending'
        AND (jo.expires_at IS NULL OR jo.expires_at > NOW())
      ORDER BY jo.amount ASC, u.average_rating DESC
      LIMIT 3
      `,
      [request.id],
    );

    const metrics = metricRows[0] ?? {};
    const nearestKm =
      metrics.nearest_worker_km == null
        ? null
        : Number(metrics.nearest_worker_km);

    return {
      request: {
        ...request,
        photos,
      },
      metrics: {
        offersCount: Number(metrics.offers_count ?? 0),
        acceptedCount: Number(metrics.accepted_count ?? 0),
        estimatedMinutes:
          nearestKm == null ? null : Math.max(5, Math.ceil(nearestKm / 0.5)),
      },
      topOffers: topOfferRows.map((row) => ({
        id: row.id,
        amount: Number(row.amount),
        status: row.status,
        workerId: row.worker_id,
        workerName: `${row.first_name} ${row.last_name ?? ''}`.trim(),
        averageRating: Number(row.average_rating ?? 0),
        completedJobs: Number(row.completed_jobs ?? 0),
        agencyName: row.agency_name ?? null,
      })),
    };
  }

  public async getIncomingRequest(workerUserId: string) {
    await this.repo.expireStaleOffers();
    const user = await this.repo.getUserById(workerUserId);
    const notificationRadiusKm =
      await this.repo.getWorkerNotificationRadiusKm();

    // Nota: El filtrado de isAgencyWorker se hace ahora en el query principal
    // para no bloquear los trabajos que ya tienen asignados.

    const rows = await this.dataSource.query<any[]>(
      `
      SELECT jr.id AS request_id,
             jr.title,
             jr.description,
             jr.category,
             jr.budget,
             jr.price_type,
             jr.address,
             jr.status,
             jr.modality,
             jr.estimated_hours,
             jr.hourly_rate,
             jr.days,
             jr.daily_rate,
             jr.start_date,
             CASE
               WHEN w.current_location IS NOT NULL
                 THEN ST_Distance(jr.location, w.current_location) / 1000.0
               ELSE NULL
             END AS distance_km,
             c.id AS client_id,
             c.first_name AS client_first_name,
             c.last_name AS client_last_name,
             c.profile_photo_url AS client_photo_url,
             c.average_rating AS client_rating,
             c.completed_jobs AS client_reviews,
             c.verification_status AS client_verification,
             (
               SELECT COALESCE(json_agg(json_build_object('id', p.id, 'url', p.url)), '[]'::json)
               FROM job_request_photos p
               WHERE p.request_id = jr.id
             ) AS photos,
             jo.id AS offer_id,
             jo.amount AS offer_amount,
             jo.status AS offer_status,
             jo.expires_at AS offer_expires_at,
             CASE
               WHEN jo.status = 'pending' AND jo.expires_at IS NOT NULL
                 THEN EXTRACT(EPOCH FROM (jo.expires_at - NOW()))
               ELSE NULL
             END AS offer_seconds_left
      FROM job_requests jr
      JOIN users w ON w.id = $1
      JOIN users c ON c.id = jr.client_user_id
      LEFT JOIN job_offers jo
        ON jo.request_id = jr.id
       AND jo.worker_user_id = $1
       AND jo.status <> 'expired'
       AND (jo.status <> 'pending' OR jo.expires_at IS NULL OR jo.expires_at > NOW())
      WHERE jr.client_user_id <> $1
        AND jr.id NOT IN (SELECT request_id FROM dismissed_requests WHERE worker_user_id = $1)
        AND jr.client_user_id NOT IN (SELECT blocked_user_id FROM user_blocks WHERE blocker_user_id = $1)
        AND jr.id NOT IN (SELECT request_id FROM request_reports WHERE reporter_user_id = $1)
        AND (
          (
            jr.status IN ('searching', 'negotiating')
            AND w.is_available = true
            AND w.is_agency_worker = false
            AND w.current_location IS NOT NULL
            AND ST_DWithin(
              jr.location,
              w.current_location,
              $2::float8 * 1000
            )
            AND (
              NOT EXISTS (SELECT 1 FROM worker_skills ws0 WHERE ws0.user_id = $1)
              OR EXISTS (
                SELECT 1
                FROM worker_skills ws
                WHERE ws.user_id = $1
                  AND (
                    LOWER(ws.skill) = LOWER(jr.category)
                    OR LOWER(ws.skill) IN (
                      SELECT LOWER(value->>'name')
                      FROM jsonb_array_elements(jr.ai_categories) value
                    )
                  )
              )
            )
            AND (
              w.work_modalities IS NULL 
              OR jsonb_array_length(w.work_modalities) = 0 
              OR w.work_modalities @> jsonb_build_array(
                CASE 
                  WHEN LOWER(jr.price_type) LIKE '%hora%' OR LOWER(jr.price_type) LIKE '%hour%' THEN 'hourly'
                  WHEN LOWER(jr.price_type) LIKE '%dia%' OR LOWER(jr.price_type) LIKE '%day%' THEN 'daily'
                  ELSE 'fixed'
                END
              )
            )
          )
          OR (
            jr.status = 'assigned'
            AND EXISTS (
              SELECT 1
              FROM job_offers jo2
              WHERE jo2.request_id = jr.id
                AND jo2.worker_user_id = $1
                AND jo2.status = 'accepted'
            )
          )
        )
      ORDER BY
        CASE WHEN jr.status = 'assigned' THEN 0 ELSE 1 END,
        distance_km ASC NULLS LAST,
        jr.created_at DESC
      `,
      [workerUserId, notificationRadiusKm],
    );

    if (rows.length === 0) {
      return {
        isAvailable: Boolean(user.isAvailable),
        available: Boolean(user.isAvailable),
        requests: [],
      };
    }

    const offerLifetimeConfig = await this.repo.getOfferLifetimeConfig();
    const requests = rows.map((row) => {
      const offerLifetimeSeconds = this.repo.resolveOfferLifetimeSeconds(
        offerLifetimeConfig,
        row.price_type,
      );
      return {
        id: row.request_id,
        title: row.title,
        description: row.description,
        category: row.category,
        budget: Number(row.budget),
        priceType: row.price_type,
        modality: row.modality,
        estimatedHours:
          row.estimated_hours == null ? null : Number(row.estimated_hours),
        hourlyRate: row.hourly_rate == null ? null : Number(row.hourly_rate),
        days: row.days == null ? null : Number(row.days),
        dailyRate: row.daily_rate == null ? null : Number(row.daily_rate),
        startDate: row.start_date,
        address: row.address,
        status: row.status,
        photos: row.photos ?? [],
        distanceKm: row.distance_km == null ? null : Number(row.distance_km),
        client: {
          id: row.client_id,
          name: `${row.client_first_name} ${row.client_last_name ?? ''}`.trim(),
          profilePhotoUrl: row.client_photo_url ?? null,
          rating: Number(row.client_rating ?? 0),
          reviews: Number(row.client_reviews ?? 0),
          isVerified: row.client_verification === 'verified',
        },
        workerOffer: row.offer_id
          ? {
              id: row.offer_id,
              amount: Number(row.offer_amount ?? 0),
              status: row.offer_status ?? 'pending',
              expiresAt: row.offer_expires_at ?? null,
              secondsRemaining:
                row.offer_seconds_left == null
                  ? null
                  : Math.max(0, Math.floor(Number(row.offer_seconds_left))),
            }
          : null,
        offerLifetimeSeconds,
      };
    });

    return {
      isAvailable: Boolean(user.isAvailable),
      available: Boolean(user.isAvailable),
      offerLifetimeSeconds:
        requests.length > 0 ? requests[0].offerLifetimeSeconds : 120,
      request: requests.length > 0 ? requests[0] : null,
      requests,
    };
  }

  public async blockUser(blockerUserId: string, blockedUserId: string) {
    await this.dataSource.query(
      `INSERT INTO user_blocks (blocker_user_id, blocked_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [blockerUserId, blockedUserId],
    );
    return { success: true };
  }

  public async reportRequest(
    requestId: string,
    reporterUserId: string,
    reason: string,
  ) {
    await this.dataSource.query(
      `INSERT INTO request_reports (request_id, reporter_user_id, reason) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [requestId, reporterUserId, reason],
    );

    const reqRes = await this.dataSource.query(
      'SELECT client_user_id FROM job_requests WHERE id = $1',
      [requestId],
    );
    const reportedUserId = reqRes.length > 0 ? reqRes[0].client_user_id : null;

    await this.dataSource.query(
      `INSERT INTO disputes (request_id, reported_by, reported_user, reason, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        requestId,
        reporterUserId,
        reportedUserId,
        'Reporte de Publicación Inapropiada',
        reason,
      ],
    );

    return { success: true };
  }

  public async dismissRequest(requestId: string, workerUserId: string) {
    await this.dataSource.query(
      `INSERT INTO dismissed_requests (request_id, worker_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [requestId, workerUserId],
    );
    return { success: true };
  }

  public async getTracking(requestId: string) {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT jr.id AS request_id,
             jr.title,
             jr.address AS request_address,
             jr.status AS request_status,
             jr.worker_arrived,
             jr.client_confirmed_arrival,
             jr.completed_at,
             jr.work_started_at,
             jr.price_type,
             jr.modality,
             jr.estimated_hours,
             jr.hourly_rate,
             jr.days,
             jr.daily_rate,
             jr.start_date,
             ST_Y(jr.location::geometry) AS dest_lat,
             ST_X(jr.location::geometry) AS dest_lng,
             w.id AS worker_id,
             w.first_name AS worker_first_name,
             w.last_name AS worker_last_name,
             w.profile_photo_url AS worker_photo,
             ST_Y(w.current_location::geometry) AS worker_lat,
             ST_X(w.current_location::geometry) AS worker_lng,
             CASE
               WHEN w.current_location IS NOT NULL
                 THEN ST_Distance(w.current_location, jr.location) / 1000.0
               ELSE NULL
             END AS distance_km,
             jo.amount,
             c.id AS client_id,
             c.first_name AS client_first_name,
             c.last_name AS client_last_name,
             c.profile_photo_url AS client_photo
      FROM job_requests jr
      JOIN job_offers jo ON jo.request_id = jr.id AND jo.status = 'accepted'
      JOIN users w ON w.id = jo.worker_user_id
      JOIN users c ON c.id = jr.client_user_id
      WHERE jr.id = $1
      LIMIT 1
      `,
      [requestId],
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundException('No tracking available for this request');
    }

    const distanceKm = row.distance_km == null ? null : Number(row.distance_km);

    return {
      requestId: row.request_id,
      title: row.title,
      address: row.request_address,
      status: row.request_status,
      priceType: row.price_type,
      modality: row.modality,
      estimatedHours:
        row.estimated_hours == null ? null : Number(row.estimated_hours),
      hourlyRate: row.hourly_rate == null ? null : Number(row.hourly_rate),
      days: row.days == null ? null : Number(row.days),
      dailyRate: row.daily_rate == null ? null : Number(row.daily_rate),
      startDate: row.start_date,
      workerArrived: row.worker_arrived ?? false,
      clientConfirmedArrival: row.client_confirmed_arrival ?? false,
      completedAt: row.completed_at ?? null,
      workStartedAt: row.work_started_at ?? null,
      workElapsedSeconds: row.work_started_at
        ? Math.floor(
            (Date.now() - new Date(row.work_started_at).getTime()) / 1000,
          )
        : null,
      distanceKm,
      etaMinutes:
        distanceKm == null ? null : Math.max(5, Math.ceil(distanceKm / 0.5)),
      agreedAmount: Number(row.amount),
      destination: {
        latitude: row.dest_lat ? Number(row.dest_lat) : null,
        longitude: row.dest_lng ? Number(row.dest_lng) : null,
      },
      worker: {
        id: row.worker_id,
        firstName: row.worker_first_name,
        lastName: row.worker_last_name ?? '',
        profilePhotoUrl: row.worker_photo ?? null,
        latitude: row.worker_lat ? Number(row.worker_lat) : null,
        longitude: row.worker_lng ? Number(row.worker_lng) : null,
      },
      client: {
        id: row.client_id,
        firstName: row.client_first_name,
        lastName: row.client_last_name ?? '',
        profilePhotoUrl: row.client_photo ?? null,
      },
    };
  }

  public async workerMarkArrived(params: {
    requestId: string;
    workerUserId: string;
  }) {
    const rows = await this.dataSource.query<any[]>(
      `
      UPDATE job_requests
      SET worker_arrived = true, updated_at = NOW()
      WHERE id = $1
        AND status NOT IN ('cancelled', 'completed')
        AND EXISTS (
          SELECT 1 FROM job_offers jo
          WHERE jo.request_id = $1
            AND jo.worker_user_id = $2
            AND jo.status = 'accepted'
        )
      RETURNING id, worker_arrived, client_confirmed_arrival
      `,
      [params.requestId, params.workerUserId],
    );
    // Sin el guard de estado bastaba con que existiera la oferta aceptada — que
    // sobrevive a la cancelación — para marcar "ya llegué" en un trabajo
    // cancelado y dispararle un push al cliente.
    if (!rows[0])
      throw new NotFoundException(
        'Request not found, not authorized, or no longer active',
      );

    this.realtimeGateway.emitToUser(params.workerUserId, 'job.worker_arrived', {
      requestId: params.requestId,
    });
    // Sin ORDER BY/LIMIT este JOIN devolvía una fila por cada token del cliente
    // y `[0]` tomaba uno arbitrario, a menudo muerto. El token se resuelve
    // aparte con el helper que ya usa el resto del archivo (más reciente).
    const clientRows = await this.dataSource.query<any[]>(
      `
      SELECT jr.client_user_id, jr.title, u.first_name as worker_name
      FROM job_requests jr
      JOIN users u ON u.id = $2
      WHERE jr.id = $1
      `,
      [params.requestId, params.workerUserId],
    );
    if (clientRows[0]) {
      const clientUserId = clientRows[0].client_user_id;
      this.realtimeGateway.emitToUser(clientUserId, 'job.worker_arrived', {
        requestId: params.requestId,
      });
      const clientToken = await this.repo.getLatestPushToken(clientUserId);
      if (clientToken) {
        await this.notificationsService
          .notifyWorkerArrived({
            userId: clientUserId,
            token: clientToken,
            workerName: clientRows[0].worker_name,
            jobTitle: clientRows[0].title,
            requestId: params.requestId,
          })
          .catch((e) =>
            this.logger.error('Failed to send worker arrived notification', e),
          );
      }
    }

    return { requestId: params.requestId, workerArrived: true };
  }

  public async clientConfirmArrival(params: {
    requestId: string;
    clientUserId: string;
  }) {
    const rows = await this.dataSource.query<any[]>(
      `
      UPDATE job_requests
      SET client_confirmed_arrival = true,
          work_started_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
        AND client_user_id = $2
        AND status NOT IN ('cancelled', 'completed')
        AND worker_arrived = true
      RETURNING id, worker_arrived, client_confirmed_arrival, work_started_at
      `,
      [params.requestId, params.clientUserId],
    );
    // `work_started_at` es la base del cobro por hora: sin estos guards se podía
    // arrancar el reloj de un trabajo cancelado, o de una llegada que el worker
    // nunca marcó. La UI ya exige `workerArrived && !clientConfirmed` para
    // habilitar el botón, así que esto solo cierra la puerta a nivel API.
    if (!rows[0])
      throw new BadRequestException(
        'No se puede confirmar la llegada: el trabajo no está activo o el trabajador aún no marcó su llegada',
      );

    const offerRows = await this.dataSource.query<any[]>(
      `SELECT worker_user_id FROM job_offers WHERE request_id = $1 AND status = 'accepted' LIMIT 1`,
      [params.requestId],
    );
    if (offerRows[0]) {
      this.realtimeGateway.emitToUser(
        offerRows[0].worker_user_id,
        'job.client_confirmed',
        {
          requestId: params.requestId,
        },
      );

      const workerTokenRows = await this.dataSource.query<any[]>(
        `SELECT token AS push_token FROM push_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1`,
        [offerRows[0].worker_user_id],
      );
      const clientUser = await this.repo.getUserById(params.clientUserId);
      const reqInfo = await this.repo.getRequestById(params.requestId);
      this.notificationsService
        .notifyClientConfirmedArrival({
          userId: offerRows[0].worker_user_id,
          token: workerTokenRows[0]?.push_token || null,
          clientName: clientUser.firstName,
          jobTitle: reqInfo.title,
          requestId: params.requestId,
        })
        .catch((e) =>
          this.logger.error('Failed to notify arrival confirmed', e),
        );
    }

    return { requestId: params.requestId, clientConfirmedArrival: true };
  }

  public async completeJob(params: {
    requestId: string;
    workerUserId: string;
  }) {
    const checkRows = await this.dataSource.query<any[]>(
      `
      SELECT jr.id, jr.client_confirmed_arrival, jr.client_user_id
      FROM job_requests jr
      JOIN job_offers jo ON jo.request_id = jr.id AND jo.worker_user_id = $2 AND jo.status = 'accepted'
      WHERE jr.id = $1
      LIMIT 1
      `,
      [params.requestId, params.workerUserId],
    );
    const req = checkRows[0];
    if (!req)
      throw new NotFoundException('Request not found or not authorized');
    if (!req.client_confirmed_arrival) {
      throw new BadRequestException(
        'El cliente aún no ha confirmado tu llegada',
      );
    }

    // La oferta aceptada sobrevive a la cancelación (closePendingOffers solo
    // cierra las 'pending'), así que sin este guard un trabajo cancelado podía
    // completarse igual y "resucitar", contando para pagos y estadísticas.
    const completedRows = await this.dataSource.query<any[]>(
      `
      UPDATE job_requests
      SET status = 'completed', completed_at = NOW(), updated_at = NOW()
      WHERE id = $1
        AND status NOT IN ('cancelled', 'completed')
      RETURNING id
      `,
      [params.requestId],
    );
    if (!completedRows[0]) {
      throw new BadRequestException(
        'El trabajo ya fue cancelado o completado',
      );
    }
    this.realtimeGateway.server.emit('request.status.updated', {
      requestId: params.requestId,
      status: 'completed',
      timestamp: new Date().toISOString(),
    });
    await this.dataSource.query(
      `UPDATE users SET is_available = true, updated_at = NOW() WHERE id = $1`,
      [params.workerUserId],
    );
    this.logger.log(
      `[completeJob] Worker ${params.workerUserId} restaurado como disponible`,
    );

    this.realtimeGateway.emitToUser(params.workerUserId, 'job.completed', {
      requestId: params.requestId,
    });
    this.realtimeGateway.emitToUser(req.client_user_id, 'job.completed', {
      requestId: params.requestId,
    });

    const infoRows = await this.dataSource.query<any[]>(
      `
      SELECT jr.title, u.first_name as worker_name, pt.token
      FROM job_requests jr
      JOIN users u ON u.id = $2
      LEFT JOIN push_tokens pt ON pt.user_id = jr.client_user_id
      WHERE jr.id = $1
      `,
      [params.requestId, params.workerUserId],
    );
    if (infoRows[0]?.token) {
      await this.notificationsService
        .notifyJobFinished({
          userId: req.client_user_id,
          token: infoRows[0].token,
          workerName: infoRows[0].worker_name,
          jobTitle: infoRows[0].title,
          requestId: params.requestId,
        })
        .catch((e) =>
          this.logger.error('Failed to send job finished notification', e),
        );
    }

    this.logger.log(
      `[completeJob] Trabajo ${params.requestId} completado por worker ${params.workerUserId}`,
    );

    return { requestId: params.requestId, status: 'completed' };
  }

  public async cancelJob(params: { requestId: string; userId: string }) {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT jr.id, jr.title, jr.status, jr.client_user_id, jo.worker_user_id
      FROM job_requests jr
      LEFT JOIN job_offers jo ON jo.request_id = jr.id AND jo.status = 'accepted'
      WHERE jr.id = $1
        AND (jr.client_user_id = $2 OR jo.worker_user_id = $2)
      LIMIT 1
      `,
      [params.requestId, params.userId],
    );
    const req = rows[0];
    if (!req)
      throw new NotFoundException('Request not found or not authorized');

    if (req.status === 'cancelled' || req.status === 'completed') {
      throw new BadRequestException(
        req.status === 'cancelled'
          ? 'El trabajo ya fue cancelado'
          : 'No se puede cancelar un trabajo completado',
      );
    }

    const cancelledRows = await this.dataSource.query<any[]>(
      `
      UPDATE job_requests
      SET status = 'cancelled', updated_at = NOW(), cancelled_by = $2
      WHERE id = $1
        AND status NOT IN ('cancelled', 'completed')
      RETURNING id
      `,
      [params.requestId, params.userId],
    );
    if (!cancelledRows[0]) {
      throw new BadRequestException('El trabajo ya no se puede cancelar');
    }

    // Cerrar ofertas pendientes y avisar a los workers que estaban negociando
    const closedOffers = await this.repo.closePendingOffers(params.requestId);
    this.realtimeGateway.server.emit('request.status.updated', {
      requestId: params.requestId,
      status: 'cancelled',
      timestamp: new Date().toISOString(),
    });
    if (req.worker_user_id) {
      await this.dataSource.query(
        `UPDATE users SET is_available = true, updated_at = NOW() WHERE id = $1`,
        [req.worker_user_id],
      );
      this.logger.log(
        `[cancelJob] Worker ${req.worker_user_id} restaurado como disponible`,
      );
    }

    if (req.client_user_id) {
      this.realtimeGateway.emitToUser(req.client_user_id, 'job.cancelled', {
        requestId: params.requestId,
        cancelerUserId: params.userId,
      });
    }
    if (req.worker_user_id) {
      this.realtimeGateway.emitToUser(req.worker_user_id, 'job.cancelled', {
        requestId: params.requestId,
        cancelerUserId: params.userId,
      });
    }

    const canceler = await this.repo.getUserById(params.userId);
    const targetUserId =
      req.client_user_id === params.userId
        ? req.worker_user_id
        : req.client_user_id;
    if (targetUserId) {
      const tokenRows = await this.dataSource.query<any[]>(
        `SELECT token AS push_token FROM push_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1`,
        [targetUserId],
      );
      await this.notificationsService
        .notifyJobCancelled({
          userId: targetUserId,
          token: tokenRows[0]?.push_token || null,
          cancelerName: canceler.firstName,
          jobTitle: req.title,
          requestId: params.requestId,
        })
        .catch((e) => this.logger.error('Failed to notify cancel', e));
    }

    // Avisar a los workers con ofertas pendientes que la solicitud se cerró
    for (const closed of closedOffers) {
      if (closed.workerUserId === params.userId) continue;
      this.realtimeGateway.emitToUser(closed.workerUserId, 'job.cancelled', {
        requestId: params.requestId,
        cancelerUserId: params.userId,
      });
      const token = await this.repo.getLatestPushToken(closed.workerUserId);
      this.notificationsService
        .notifyRequestClosed({
          userId: closed.workerUserId,
          token,
          jobTitle: req.title,
          requestId: params.requestId,
        })
        .catch((e) =>
          this.logger.error('Failed to notify pending-offer worker', e),
        );
    }

    return { requestId: params.requestId, status: 'cancelled' };
  }

  public async getWorkerRadar(workerUserId: string) {
    const worker = await this.repo.getUserById(workerUserId);
    const notificationRadiusKm =
      await this.repo.getWorkerNotificationRadiusKm();

    const rows = await this.dataSource.query<any[]>(
      `
      WITH jobs AS (
        SELECT COUNT(*)::text AS jobs_today,
               COALESCE(SUM(jo.amount), 0)::text AS earnings_today
        FROM job_offers jo
        JOIN job_requests jr ON jr.id = jo.request_id
        WHERE jo.worker_user_id = $1
          AND jo.status = 'accepted'
          AND DATE(jr.created_at) = CURRENT_DATE
      ),
      nearby AS (
        SELECT COUNT(*)::text AS nearby_requests
        FROM users w
        JOIN job_requests jr ON true
        WHERE w.id = $1
          AND w.is_available = true
          AND w.current_location IS NOT NULL
          AND jr.status IN ('searching', 'negotiating')
          AND ST_DWithin(jr.location, w.current_location, $2::float8 * 1000)
      )
      SELECT jobs.jobs_today, jobs.earnings_today, nearby.nearby_requests
      FROM jobs, nearby
      `,
      [workerUserId, notificationRadiusKm],
    );

    const skills = await this.getWorkerSkills(workerUserId);

    return {
      worker,
      available: worker.isAvailable,
      location: {
        latitude: worker.currentLatitude,
        longitude: worker.currentLongitude,
        workRadiusKm: worker.workRadiusKm,
      },
      summary: {
        jobsToday: Number(rows[0]?.jobs_today ?? 0),
        earningsToday: Number(rows[0]?.earnings_today ?? 0),
        nearbyRequests: Number(rows[0]?.nearby_requests ?? 0),
      },
      skills: skills.skills,
    };
  }

  private async getWorkerSkills(workerUserId: string) {
    const rows = await this.dataSource.query<any[]>(
      `SELECT skill FROM worker_skills WHERE user_id = $1 ORDER BY skill ASC`,
      [workerUserId],
    );
    return { skills: rows.map((row) => row.skill) };
  }

  public async createReview(params: {
    requestId: string;
    workerUserId: string;
    clientUserId: string;
    stars: number;
    comment?: string;
  }) {
    if (
      !Number.isInteger(params.stars) ||
      params.stars < 1 ||
      params.stars > 5
    ) {
      throw new BadRequestException('stars must be between 1 and 5');
    }

    await this.repo.getUserById(params.workerUserId);
    await this.repo.getUserById(params.clientUserId);
    const req = await this.repo.getRequestById(params.requestId);

    if (req.status !== 'completed') {
      throw new BadRequestException('Request is not completed yet');
    }

    if (req.client_user_id !== params.clientUserId) {
      throw new BadRequestException(
        'Client user ID does not match the request',
      );
    }

    const insertResult = await this.dataSource.query(
      `
      INSERT INTO worker_reviews (request_id, worker_user_id, client_user_id, stars, comment)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (request_id) DO NOTHING
      RETURNING id
      `,
      [
        params.requestId,
        params.workerUserId,
        params.clientUserId,
        params.stars,
        params.comment ?? null,
      ],
    );

    if (!insertResult.length) {
      return { saved: false, alreadyReviewed: true };
    }

    const rows = await this.dataSource.query<any[]>(
      `
      SELECT COALESCE(AVG(r.stars), 0) AS average_rating,
             (SELECT COUNT(*)::text
              FROM job_requests jr
              JOIN job_offers jo ON jo.request_id = jr.id
              WHERE jo.worker_user_id = $1 AND jo.status = 'accepted' AND jr.status = 'completed'
             ) AS completed_jobs
      FROM worker_reviews r
      WHERE r.worker_user_id = $1
      `,
      [params.workerUserId],
    );

    await this.dataSource.query(
      `
      UPDATE users
      SET average_rating = $2,
          completed_jobs = $3,
          updated_at = NOW()
      WHERE id = $1
      `,
      [
        params.workerUserId,
        Number(rows[0]?.average_rating ?? 0),
        Number(rows[0]?.completed_jobs ?? 0),
      ],
    );

    const clientUser = await this.repo.getUserById(params.clientUserId);
    const workerTokenRows = await this.dataSource.query<any[]>(
      `SELECT token AS push_token FROM push_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1`,
      [params.workerUserId],
    );
    this.notificationsService
      .notifyNewReview({
        userId: params.workerUserId,
        token: workerTokenRows[0]?.push_token || null,
        clientName: clientUser.firstName,
        stars: params.stars,
        jobTitle: req.title,
        requestId: params.requestId,
      })
      .catch((e) => this.logger.error('Failed to notify new review', e));

    return {
      saved: true,
      workerUserId: params.workerUserId,
      averageRating: Number(rows[0]?.average_rating ?? 0),
      completedJobs: Number(rows[0]?.completed_jobs ?? 0),
    };
  }

  private async seedOffersForRequest(requestId: string, baseBudget: number) {
    const request = await this.repo.getRequestById(requestId);
    const notificationRadiusKm =
      await this.repo.getWorkerNotificationRadiusKm();
    const normalizedSkills = [
      ...new Set([
        request.category,
        ...(request.aiCategories ?? []).map((item) => item.name),
      ]),
    ]
      .map((value) =>
        String(value ?? '')
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean);

    const isGeneral =
      normalizedSkills.length === 0 ||
      normalizedSkills.every((s) => s === 'general');

    const requiredModality = String(request.price_type ?? '')
      .toLowerCase()
      .includes('hora')
      ? 'hourly'
      : String(request.price_type ?? '')
            .toLowerCase()
            .includes('dia')
        ? 'daily'
        : 'fixed';

    const workers = await this.dataSource.query<any[]>(
      `
      SELECT u.id,
             ST_Distance(u.current_location, $1::geography) / 1000.0 AS distance_km
      FROM users u
      WHERE u.type = 'worker'
        AND u.is_available = true
        AND u.current_location IS NOT NULL
        AND ST_DWithin(u.current_location, $1::geography, $4::float8 * 1000)
        AND (
          $2::boolean = true
          OR cardinality($3::text[]) = 0
          OR EXISTS (
            SELECT 1
            FROM worker_skills ws
            WHERE ws.user_id = u.id
              AND LOWER(ws.skill) = ANY($3::text[])
          )
          OR NOT EXISTS (
            SELECT 1 FROM worker_skills ws2 WHERE ws2.user_id = u.id
          )
        )
        AND (
          u.work_modalities IS NULL 
          OR jsonb_array_length(u.work_modalities) = 0 
          OR u.work_modalities @> jsonb_build_array($5::text)
        )
      ORDER BY ST_Distance(u.current_location, $1::geography) ASC
      `,
      [
        request.location,
        isGeneral,
        normalizedSkills,
        notificationRadiusKm,
        requiredModality,
      ],
    );

    const targetWorkers = workers.map((worker, index) => ({
      workerId: String(worker.id),
      distanceKm: Number(worker.distance_km ?? 0),
      queuePosition: index + 1,
    }));
    const waveSize = MobileRequestsService.WORKER_NOTIFICATION_WAVE_SIZE;
    const totalWaves = Math.ceil(targetWorkers.length / waveSize);
    const useQueueDispatch =
      this.configService.get('USE_QUEUE_DISPATCH') === 'true';

    for (let waveIndex = 0; waveIndex < totalWaves; waveIndex += 1) {
      const from = waveIndex * waveSize;
      const to = from + waveSize;
      const waveWorkers = targetWorkers.slice(from, to);
      if (waveWorkers.length === 0) {
        continue;
      }

      const wavePayload = {
        requestId,
        category: request.category,
        title: request.title,
        budget: Number(request.budget ?? baseBudget),
        address: request.address,
        description: request.description,
        aiCategories: request.aiCategories ?? [],
        waveWorkers,
        waveIndex,
      };

      if (waveIndex === 0) {
        await this.dispatchWorkerNotificationWave(wavePayload);
        continue;
      }

      const delayMs =
        waveIndex * MobileRequestsService.WORKER_NOTIFICATION_WAVE_DELAY_MS;

      if (useQueueDispatch) {
        await this.waveQueueService
          .enqueueWave(wavePayload, delayMs)
          .catch((error: unknown) => {
            const message =
              error instanceof Error ? error.message : String(error);
            this.logger.error(
              `[request.new] Error encolando ola ${waveIndex} para ${requestId}: ${message}`,
            );
          });
      } else {
        setTimeout(() => {
          void this.dispatchWorkerNotificationWave(wavePayload).catch(
            (error: unknown) => {
              const message =
                error instanceof Error ? error.message : String(error);
              this.logger.error(
                `[request.new] Error enviando ola ${waveIndex} para ${requestId}: ${message}`,
              );
            },
          );
        }, delayMs);
      }
    }

    this.logger.log(
      `[seedOffers] Solicitud ${requestId}: ${targetWorkers.length} worker(s) en pila por cercania (radioConfigKm=${notificationRadiusKm}, waveSize=${waveSize}, waveDelayMs=${MobileRequestsService.WORKER_NOTIFICATION_WAVE_DELAY_MS}, skills=${JSON.stringify(normalizedSkills)})`,
    );

    return targetWorkers.length;
  }

  private async dispatchWorkerNotificationWave(params: {
    requestId: string;
    category: string;
    title: string;
    budget: number;
    address: string;
    description: string;
    aiCategories: Array<{ id: string; name: string; confidence: number }>;
    waveWorkers: Array<{
      workerId: string;
      distanceKm: number;
      queuePosition: number;
    }>;
  }) {
    const requestRows = await this.dataSource.query<any[]>(
      `
      SELECT status
      FROM job_requests
      WHERE id = $1
      LIMIT 1
      `,
      [params.requestId],
    );
    const currentStatus = String(requestRows[0]?.status ?? '');
    if (currentStatus !== 'searching') {
      this.logger.log(
        `[request.new] Ola cancelada para ${params.requestId}: estado actual ${currentStatus}`,
      );
      return;
    }

    for (const worker of params.waveWorkers) {
      this.logger.log(
        `[request.new] Notificando worker ${worker.workerId} (${worker.distanceKm.toFixed(1)} km) [posicion ${worker.queuePosition}] solicitud ${params.requestId}`,
      );

      this.realtimeGateway.emitToUser(worker.workerId, 'request.new', {
        requestId: params.requestId,
        category: params.category,
        title: params.title,
        budget: params.budget,
        distanceKm: worker.distanceKm,
        address: params.address,
        description: params.description,
        aiCategories: params.aiCategories,
        queuePosition: worker.queuePosition,
      });
    }

    const workerIds = params.waveWorkers.map((worker) => worker.workerId);
    const tokenRows = await this.dataSource.query<any[]>(
      `
      SELECT user_id, token
      FROM push_tokens
      WHERE user_id = ANY($1::uuid[])
      `,
      [workerIds],
    );

    const users = tokenRows.map((row) => ({
      userId: row.user_id,
      token: row.token,
    }));
    if (users.length === 0) {
      return;
    }

    const nearestDistance = Math.min(
      ...params.waveWorkers.map((worker) => worker.distanceKm),
    );
    await this.notificationsService.notifyWorkersForJobWave({
      users,
      jobId: params.requestId,
      category: params.category,
      offeredPrice: `Bs ${Math.round(params.budget)}`,
      distanceKm: nearestDistance.toFixed(1),
    });
  }

  private async classifyRequestCategoriesWithAi(params: {
    title: string;
    description: string;
    fallbackCategory: string;
  }): Promise<Array<{ id: string; name: string; confidence: number }>> {
    const fallbackCategory =
      params.fallbackCategory?.trim() || MobileRequestsService.DEFAULT_CATEGORY;
    const catalog = await this.listActiveCategoryCatalogForAi();
    if (catalog.length === 0) {
      this.logger.warn('[Gemini] Catálogo vacío, usando fallback');
      return [
        {
          id: this.repo.toCategoryId(fallbackCategory),
          name: fallbackCategory,
          confidence: 0.5,
        },
      ];
    }

    const aiConfig = await this.getAiConfig();
    const activeProvider = aiConfig.activeProvider || 'nvidia';

    let endpointUrl = '';
    let apiKey = '';
    let modelName = '';

    if (activeProvider === 'nvidia' && aiConfig.nvidiaKey) {
      endpointUrl = 'https://integrate.api.nvidia.com/v1/chat/completions';
      apiKey = aiConfig.nvidiaKey;
      modelName = aiConfig.nvidiaModel || 'meta/llama-3.1-8b-instruct';
    } else if (activeProvider === 'gemini' && aiConfig.geminiKey) {
      endpointUrl =
        'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
      apiKey = aiConfig.geminiKey;
      modelName = 'gemini-2.0-flash';
    } else if (activeProvider === 'deepseek' && aiConfig.deepseekKey) {
      endpointUrl = 'https://api.deepseek.com/v1/chat/completions';
      apiKey = aiConfig.deepseekKey;
      modelName = 'deepseek-chat';
    } else {
      const msg = `[AI] API Key no configurada para ${activeProvider} → usando fallback "${fallbackCategory}".`;
      this.logger.warn(msg);

      this.apiLogsService
        .capture({
          method: 'POST',
          path: `[AI] ${activeProvider} - BLOCKED`,
          statusCode: 400,
          durationMs: 0,
          requestBodyJson: { activeProvider, fallbackCategory },
          errorMessage: msg,
        })
        .catch((e) => this.logger.error('Failed to log AI API block', e));

      return [
        {
          id: this.repo.toCategoryId(fallbackCategory),
          name: fallbackCategory,
          confidence: 0.5,
        },
      ];
    }

    this.logger.log(
      `[AI] Clasificando con ${activeProvider}: "${params.title}" | "${params.description.slice(0, 60)}…"`,
    );

    const categoryCatalog = catalog
      .map((item) => `- id: ${item.id}, nombre: ${item.name}`)
      .join('\n');

    const prompt = `
Eres un asistente que clasifica solicitudes de trabajo en Bolivia.

Catalogo de categorias permitidas:
${categoryCatalog}

Entrada del usuario:
- titulo: ${params.title ?? ''}
- descripcion: ${params.description ?? ''}

Reglas obligatorias:
1) Devuelve SOLO JSON valido.
2) Formato exacto:
{
  "categorias": [
    { "id": "string", "nombre": "string", "confianza": 0.0 }
  ]
}
3) Ordena por confianza descendente.
4) Devuelve una o varias categorias segun corresponda, sin limite fijo.
5) El "id" y "nombre" deben pertenecer al catalogo permitido.
6) Si hay duda, incluye "trabajo_general" / "General".
7) No agregues texto fuera del JSON.
`.trim();

    const endpoint = new URL(endpointUrl);

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      MobileRequestsService.GEMINI_TIMEOUT_MS,
    );

    const startTime = Date.now();
    const isReasoningModel = modelName.includes('minimax');
    const requestBodyJson: any = {
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      temperature: isReasoningModel ? 1.0 : 0.1,
      max_tokens: isReasoningModel ? 1500 : 300,
      stream: false,
    };

    if (isReasoningModel) {
      requestBodyJson.top_p = 0.95;
    } else {
      requestBodyJson.response_format = { type: 'json_object' };
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBodyJson),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        this.logger.error(
          `[${activeProvider}] HTTP ${response.status} → fallback "${fallbackCategory}" | detalle: ${errBody.slice(0, 300)}`,
        );
        this.apiLogsService
          .capture({
            method: 'POST',
            path: `[AI] ${activeProvider} - ${modelName}`,
            statusCode: response.status,
            durationMs: Date.now() - startTime,
            requestBodyJson,
            errorMessage: errBody,
            responsePreview: errBody.slice(0, 1000),
          })
          .catch((e) => this.logger.error('Failed to log AI API error', e));
        return [
          {
            id: this.repo.toCategoryId(fallbackCategory),
            name: fallbackCategory,
            confidence: 0.5,
          },
        ];
      }

      const payload = await response.json();

      const text = payload.choices?.[0]?.message?.content?.trim() ?? '';

      this.logger.log(`[AI_CATEGORIZATION_RAW] (${activeProvider}) -> ${text}`);

      this.apiLogsService
        .capture({
          method: 'POST',
          path: `[AI] ${activeProvider} - ${modelName}`,
          statusCode: response.status,
          durationMs: Date.now() - startTime,
          requestBodyJson,
          queryJson: payload,
          responsePreview: text.slice(0, 1000),
        })
        .catch((e) => this.logger.error('Failed to log AI API success', e));

      if (!text) {
        this.logger.warn(`[${activeProvider}] Respuesta vacía → fallback`);
        return [
          {
            id: this.repo.toCategoryId(fallbackCategory),
            name: fallbackCategory,
            confidence: 0.5,
          },
        ];
      }

      const parsed = this.geoHelpers.parseAiCategoriesFromText({
        text,
        catalog,
        fallbackCategory,
      });
      if (parsed.length > 0) {
        this.logger.log(
          `[${activeProvider}] Categorías detectadas: ${parsed.map((c) => c.name).join(', ')}`,
        );
        return parsed;
      }

      this.logger.warn(
        `[${activeProvider}] No se pudo parsear respuesta → fallback`,
      );
      return [
        {
          id: this.repo.toCategoryId(fallbackCategory),
          name: fallbackCategory,
          confidence: 0.5,
        },
      ];
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      this.logger.error(
        `[${activeProvider}] Error: ${msg} → fallback "${fallbackCategory}"`,
      );
      this.apiLogsService
        .capture({
          method: 'POST',
          path: `[AI] ${activeProvider} - ${modelName}`,
          statusCode: 500,
          durationMs: Date.now() - startTime,
          requestBodyJson,
          errorMessage: msg,
        })
        .catch((e) => this.logger.error('Failed to log AI API catch error', e));
      return [
        {
          id: this.repo.toCategoryId(fallbackCategory),
          name: fallbackCategory,
          confidence: 0.5,
        },
      ];
    } finally {
      clearTimeout(timeout);
    }
  }

  private async listActiveCategoryCatalogForAi(): Promise<
    Array<{ id: string; name: string }>
  > {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT id, name
      FROM categories
      WHERE is_active = true
      ORDER BY name ASC
      LIMIT 250
      `,
    );

    const catalog = rows
      .map((row) => ({
        id: String(row.id ?? '')
          .trim()
          .toLowerCase(),
        name: String(row.name ?? '').trim(),
      }))
      .filter((row) => row.id && row.name);

    const hasGeneral = catalog.some(
      (item) =>
        item.id === 'trabajo_general' || item.name.toLowerCase() === 'general',
    );
    if (!hasGeneral) {
      catalog.push({
        id: 'trabajo_general',
        name: MobileRequestsService.DEFAULT_CATEGORY,
      });
    }
    return catalog;
  }

  private async getAiConfig() {
    const rows = await this.dataSource.query<any[]>(
      `SELECT value_json FROM app_config WHERE key = 'ai_config' LIMIT 1`,
    );
    const defaultVal = {
      activeProvider:
        this.configService.get<string>('AI_ACTIVE_PROVIDER') || 'nvidia',
      geminiKey: this.configService.get<string>('GEMINI_API_KEY') || '',
      nvidiaKey: this.configService.get<string>('NVIDIA_API_KEY') || '',
      nvidiaModel:
        this.configService.get<string>('NVIDIA_MODEL') ||
        'meta/llama-3.1-8b-instruct',
      deepseekKey: this.configService.get<string>('DEEPSEEK_API_KEY') || '',
    };
    if (rows[0]) {
      const val =
        typeof rows[0].value_json === 'string'
          ? JSON.parse(rows[0].value_json)
          : rows[0].value_json;
      return {
        activeProvider: val.activeProvider || defaultVal.activeProvider,
        geminiKey: val.geminiKey || defaultVal.geminiKey,
        nvidiaKey: val.nvidiaKey || defaultVal.nvidiaKey,
        nvidiaModel: val.nvidiaModel || defaultVal.nvidiaModel,
        deepseekKey: val.deepseekKey || defaultVal.deepseekKey,
      };
    }
    return defaultVal;
  }

  private async uploadRequestPhotos(requestId: string, images: string[]) {
    const uploaded: string[] = [];
    for (const base64Data of images) {
      const result = await this.storageService.uploadBase64Image({
        base64Data,
        folder: 'chamba/requests',
      });

      await this.dataSource.query(
        `
        INSERT INTO job_request_photos (request_id, url, public_id)
        VALUES ($1, $2, $3)
        `,
        [requestId, result.url, result.publicId],
      );

      uploaded.push(result.url);
    }

    return uploaded;
  }

  private async persistUploadedRequestPhotos(
    requestId: string,
    images: Array<{ url: string; publicId: string }>,
  ) {
    const uploaded: string[] = [];
    for (const image of images) {
      await this.dataSource.query(
        `
        INSERT INTO job_request_photos (request_id, url, public_id)
        VALUES ($1, $2, $3)
        `,
        [requestId, image.url, image.publicId],
      );

      uploaded.push(image.url);
    }

    return uploaded;
  }
}
