import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { NotificationsService } from '../../notifications/notifications.service';
import { MobileRequestRepository } from '../shared/mobile-request.repository';
import { MobileCatalogService } from './mobile-catalog.service';

@Injectable()
export class MobileUsersService {
  private readonly logger = new Logger(MobileUsersService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly storageService: StorageService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly notificationsService: NotificationsService,
    private readonly repo: MobileRequestRepository,
    private readonly catalogService: MobileCatalogService,
  ) {}

  public async uploadProfilePhoto(params: {
    userId: string;
    imageBase64?: string;
    imageUrl?: string;
    imagePublicId?: string;
  }) {
    const user = await this.repo.getUserByIdWithPhotoMeta(params.userId);
    const incomingUrl = params.imageUrl?.trim();
    const incomingPublicId = params.imagePublicId?.trim();

    if (incomingUrl) {
      this.ensureSecureImageUrl(incomingUrl);

      await this.dataSource.query(
        `
      UPDATE users
      SET profile_photo_url = $2,
          profile_photo_public_id = $3,
          updated_at = NOW()
      WHERE id = $1
      `,
        [params.userId, incomingUrl, incomingPublicId || null],
      );

      if (
        user.profilePhotoPublicId &&
        (!incomingPublicId || user.profilePhotoPublicId !== incomingPublicId)
      ) {
        await this.storageService.deleteImage(user.profilePhotoPublicId);
      }

      return {
        user: await this.repo.getUserById(params.userId),
      };
    }

    const payload = params.imageBase64?.trim();
    if (!payload) {
      throw new BadRequestException('imageUrl or imageBase64 is required');
    }
    this.ensureDataUri(payload);

    const uploaded = await this.storageService.uploadBase64Image({
      base64Data: payload,
      folder: 'chamba/profile',
    });

    await this.dataSource.query(
      `
      UPDATE users
      SET profile_photo_url = $2,
          profile_photo_public_id = $3,
          updated_at = NOW()
      WHERE id = $1
      `,
      [params.userId, uploaded.url, uploaded.publicId],
    );

    if (
      user.profilePhotoPublicId &&
      user.profilePhotoPublicId !== uploaded.publicId
    ) {
      await this.storageService.deleteImage(user.profilePhotoPublicId);
    }

    return {
      user: await this.repo.getUserById(params.userId),
    };
  }

  private ensureSecureImageUrl(value: string): void {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'https:') {
        throw new UnsupportedMediaTypeException(
          'Only HTTPS image urls are supported',
        );
      }
    } catch (_) {
      throw new UnsupportedMediaTypeException('Invalid image URL');
    }
  }

  private ensureDataUri(value: string): void {
    const pattern = /^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\n\r]+$/;
    if (!pattern.test(value)) {
      throw new UnsupportedMediaTypeException(
        'Only base64 image data URI payloads are supported',
      );
    }
  }

  public async removeProfilePhoto(userId: string) {
    const user = await this.repo.getUserByIdWithPhotoMeta(userId);

    await this.dataSource.query(
      `
      UPDATE users
      SET profile_photo_url = NULL,
          profile_photo_public_id = NULL,
          updated_at = NOW()
      WHERE id = $1
      `,
      [userId],
    );

    if (user.profilePhotoPublicId) {
      await this.storageService.deleteImage(user.profilePhotoPublicId);
    }

    return {
      user: await this.repo.getUserById(userId),
    };
  }

  public async submitWorkerVerification(params: {
    workerUserId: string;
    idPhotoBase64: string;
    facePhotoBase64: string;
  }) {
    if (!params.workerUserId?.trim()) {
      throw new BadRequestException('workerUserId is required');
    }

    const user = await this.repo.getUserById(params.workerUserId);
    if (user.type !== 'worker') {
      throw new BadRequestException('Only workers can submit verification');
    }

    const idPhotoBase64 = params.idPhotoBase64?.trim();
    const facePhotoBase64 = params.facePhotoBase64?.trim();
    if (!idPhotoBase64 || !facePhotoBase64) {
      throw new BadRequestException(
        'idPhotoBase64 and facePhotoBase64 are required',
      );
    }

    this.ensureDataUri(idPhotoBase64);
    this.ensureDataUri(facePhotoBase64);

    const idUpload = await this.storageService.uploadBase64Image({
      base64Data: idPhotoBase64,
      folder: 'chamba/verification/id',
    });
    const faceUpload = await this.storageService.uploadBase64Image({
      base64Data: facePhotoBase64,
      folder: 'chamba/verification/face',
    });

    await this.dataSource.query(
      `
      UPDATE users
      SET id_photo_url = $2,
          face_photo_url = $3,
          verification_status = 'pending',
          id_photo_verified = NULL,
          face_photo_verified = NULL,
          verification_reviewed_at = NULL,
          updated_at = NOW()
      WHERE id = $1
      `,
      [params.workerUserId, idUpload.url, faceUpload.url],
    );

    const updatedUser = await this.repo.getUserById(params.workerUserId);

    this.realtimeGateway.emitToUser(
      params.workerUserId,
      'user.verification.updated',
      {
        verificationStatus: 'pending',
        idPhotoVerified: null,
        facePhotoVerified: null,
        reviewedAt: null,
        message: 'Recibimos tus fotos. Nuestro equipo las esta revisando.',
      },
    );

    return {
      submitted: true,
      user: updatedUser,
    };
  }

  public async upsertPushToken(params: {
    userId: string;
    token: string;
    platform?: string;
  }) {
    if (!params.userId) {
      throw new BadRequestException('userId is required');
    }
    const token = params.token?.trim();
    if (!token) {
      throw new BadRequestException('token is required');
    }

    await this.repo.getUserById(params.userId);

    const rows = await this.dataSource.query<any[]>(
      `
      INSERT INTO push_tokens (user_id, token, platform, last_seen_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (token)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        platform = EXCLUDED.platform,
        last_seen_at = NOW()
      RETURNING id, user_id, token, platform, last_seen_at
      `,
      [
        params.userId,
        token,
        (params.platform ?? 'unknown').trim().toLowerCase(),
      ],
    );

    return {
      pushToken: rows[0],
    };
  }

  public async setWorkerAvailability(workerUserId: string, available: boolean) {
    const rows = await this.dataSource.query<any[]>(
      `
      UPDATE users
      SET is_available = $2,
          updated_at = NOW()
      WHERE id = $1 AND type = 'worker'
      RETURNING id, is_available
      `,
      [workerUserId, available],
    );

    if (!rows[0]) {
      throw new NotFoundException('Worker not found');
    }

    return {
      workerId: rows[0].id,
      isAvailable: rows[0].is_available,
    };
  }

  public async updateWorkerLocation(params: {
    workerUserId: string;
    latitude: number;
    longitude: number;
  }) {
    if (
      !Number.isFinite(params.latitude) ||
      !Number.isFinite(params.longitude)
    ) {
      throw new BadRequestException('latitude and longitude are required');
    }

    const rows = await this.dataSource.query<any[]>(
      `
      UPDATE users
      SET current_location = ST_SetSRID(ST_MakePoint($3::float8, $2::float8), 4326)::geography,
          updated_at = NOW()
      WHERE id = $1 AND type = 'worker'
      RETURNING id,
                ST_Y(current_location::geometry) AS latitude,
                ST_X(current_location::geometry) AS longitude
      `,
      [params.workerUserId, params.latitude, params.longitude],
    );

    if (!rows[0]) {
      throw new NotFoundException('Worker not found');
    }

    const payload = {
      workerId: rows[0].id,
      latitude: Number(rows[0].latitude),
      longitude: Number(rows[0].longitude),
      timestamp: new Date().toISOString(),
    };
    this.realtimeGateway.server.emit('worker.location.updated', payload);

    return {
      ...payload,
    };
  }

  public async updateClientLocation(params: {
    clientUserId: string;
    latitude: number;
    longitude: number;
  }) {
    if (
      !Number.isFinite(params.latitude) ||
      !Number.isFinite(params.longitude)
    ) {
      throw new BadRequestException('latitude and longitude are required');
    }

    const rows = await this.dataSource.query<any[]>(
      `
      UPDATE users
      SET current_location = ST_SetSRID(ST_MakePoint($3::float8, $2::float8), 4326)::geography,
          updated_at = NOW()
      WHERE id = $1 AND type = 'client'
      RETURNING id,
                ST_Y(current_location::geometry) AS latitude,
                ST_X(current_location::geometry) AS longitude
      `,
      [params.clientUserId, params.latitude, params.longitude],
    );

    if (!rows[0]) {
      throw new NotFoundException('Client not found');
    }

    const payload = {
      clientId: rows[0].id,
      latitude: Number(rows[0].latitude),
      longitude: Number(rows[0].longitude),
      timestamp: new Date().toISOString(),
    };
    this.realtimeGateway.broadcastClientLocationUpdated(
      payload.clientId,
      payload.latitude,
      payload.longitude,
      payload.timestamp,
    );

    return payload;
  }

  public async getWorkerProfile(workerId: string) {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT id,
             first_name,
             last_name,
             profile_photo_url,
             average_rating,
             completed_jobs,
             work_radius_km,
             work_modalities,
             hourly_rate,
             daily_rate
      FROM users
      WHERE id = $1 AND type = 'worker'
      LIMIT 1
      `,
      [workerId],
    );

    const worker = rows[0];
    if (!worker) {
      throw new NotFoundException('Worker not found');
    }

    const skillRows = await this.dataSource.query<any[]>(
      `SELECT skill FROM worker_skills WHERE user_id = $1 ORDER BY skill ASC`,
      [workerId],
    );

    const reviewRows = await this.dataSource.query<any[]>(
      `
      SELECT r.stars,
             r.comment,
             r.created_at,
             CONCAT(c.first_name, ' ', COALESCE(c.last_name, '')) AS client_name
      FROM worker_reviews r
      JOIN users c ON c.id = r.client_user_id
      WHERE r.worker_user_id = $1
      ORDER BY r.created_at DESC
      LIMIT 10
      `,
      [workerId],
    );

    const galleryRows = await this.dataSource.query<any[]>(
      `
      SELECT p.url
      FROM job_request_photos p
      JOIN job_offers jo ON jo.request_id = p.request_id
      WHERE jo.worker_user_id = $1
        AND jo.status = 'accepted'
      ORDER BY p.created_at DESC
      LIMIT 10
      `,
      [workerId],
    );

    return {
      worker: {
        id: worker.id,
        firstName: worker.first_name,
        lastName: worker.last_name ?? '',
        profilePhotoUrl: worker.profile_photo_url ?? null,
        averageRating: Number(worker.average_rating ?? 0),
        completedJobs: Number(worker.completed_jobs ?? 0),
        workRadiusKm: Number(worker.work_radius_km ?? 0),
        modalities: Array.isArray(worker.work_modalities)
          ? worker.work_modalities
          : [],
        hourlyRate:
          worker.hourly_rate == null ? null : Number(worker.hourly_rate),
        dailyRate: worker.daily_rate == null ? null : Number(worker.daily_rate),
        skills: skillRows.map((row) => row.skill),
        bio: 'Especialista verificado. Puntual, responsable y con experiencia en servicios de hogar.',
        gallery: galleryRows.map((row) => row.url),
      },
      reviews: reviewRows.map((row) => ({
        stars: Number(row.stars),
        comment: row.comment,
        createdAt: row.created_at,
        clientName: String(row.client_name ?? '').trim(),
      })),
    };
  }

  public async getWorkerSkills(workerUserId: string) {
    await this.repo.getUserById(workerUserId);

    const rows = await this.dataSource.query<any[]>(
      `SELECT skill FROM worker_skills WHERE user_id = $1 ORDER BY skill ASC`,
      [workerUserId],
    );

    return {
      workerUserId,
      skills: rows.map((row) => row.skill),
    };
  }

  public async updateWorkerSkills(workerUserId: string, skills: string[]) {
    await this.repo.getUserById(workerUserId);

    const sanitized = [
      ...new Set((skills ?? []).map((item) => item.trim()).filter(Boolean)),
    ].slice(0, 20);
    await this.repo.ensureCategoriesExist(sanitized);

    await this.dataSource.query(
      `DELETE FROM worker_skills WHERE user_id = $1`,
      [workerUserId],
    );

    for (const skill of sanitized) {
      await this.dataSource.query(
        `INSERT INTO worker_skills (user_id, skill) VALUES ($1, $2)`,
        [workerUserId, skill],
      );
    }

    return {
      workerUserId,
      skills: sanitized,
    };
  }

  private static readonly ALLOWED_MODALITIES = ['fixed', 'hourly', 'daily'];

  public async getWorkerModalities(workerUserId: string) {
    await this.repo.getUserById(workerUserId);

    const rows = await this.dataSource.query<any[]>(
      `SELECT work_modalities, hourly_rate, daily_rate FROM users WHERE id = $1 LIMIT 1`,
      [workerUserId],
    );

    const row = rows[0] ?? {};
    return {
      workerUserId,
      modalities: Array.isArray(row.work_modalities) ? row.work_modalities : [],
      hourlyRate: row.hourly_rate == null ? null : Number(row.hourly_rate),
      dailyRate: row.daily_rate == null ? null : Number(row.daily_rate),
    };
  }

  public async updateWorkerModalities(
    workerUserId: string,
    input: {
      modalities?: string[];
      hourlyRate?: number | null;
      dailyRate?: number | null;
    },
  ) {
    await this.repo.getUserById(workerUserId);

    const modalities = [
      ...new Set(
        (input.modalities ?? [])
          .map((item) => String(item).trim().toLowerCase())
          .filter((item) =>
            MobileUsersService.ALLOWED_MODALITIES.includes(item),
          ),
      ),
    ];

    if (modalities.length === 0) {
      throw new BadRequestException(
        'Selecciona al menos una modalidad de trabajo',
      );
    }

    const normalizeRate = (value: number | null | undefined) => {
      if (value == null) {
        return null;
      }
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        throw new BadRequestException('La tarifa debe ser mayor a 0');
      }
      return numeric;
    };

    // Solo guardamos la tarifa de la modalidad que el worker activó.
    const hourlyRate = modalities.includes('hourly')
      ? normalizeRate(input.hourlyRate)
      : null;
    const dailyRate = modalities.includes('daily')
      ? normalizeRate(input.dailyRate)
      : null;

    if (modalities.includes('hourly') && hourlyRate == null) {
      throw new BadRequestException('Ingresa tu tarifa por hora');
    }
    if (modalities.includes('daily') && dailyRate == null) {
      throw new BadRequestException('Ingresa tu tarifa por día');
    }

    await this.dataSource.query(
      `
      UPDATE users
      SET work_modalities = $2,
          hourly_rate = $3,
          daily_rate = $4
      WHERE id = $1
      `,
      [workerUserId, modalities, hourlyRate, dailyRate],
    );

    return {
      workerUserId,
      modalities,
      hourlyRate,
      dailyRate,
    };
  }

  public async getWorkerHistory(workerUserId: string) {
    await this.repo.getUserById(workerUserId);

    const rows = await this.dataSource.query<any[]>(
      `
      SELECT jo.id AS offer_id,
             jo.amount,
             jo.status AS offer_status,
             jo.created_at AS accepted_at,
             jr.id AS request_id,
             jr.title,
             jr.description,
             jr.category,
             jr.address,
             jr.status AS request_status,
             c.id AS client_id,
             c.first_name AS client_first_name,
             c.last_name AS client_last_name,
             c.profile_photo_url AS client_photo,
             ct.id AS thread_id,
             (SELECT p.url FROM job_request_photos p WHERE p.request_id = jr.id ORDER BY p.created_at ASC LIMIT 1) as photo_url
      FROM job_offers jo
      JOIN job_requests jr ON jr.id = jo.request_id
      JOIN users c ON c.id = jr.client_user_id
      LEFT JOIN chat_threads ct
        ON ct.request_id = jr.id
       AND ct.worker_user_id = jo.worker_user_id
       AND ct.client_user_id = jr.client_user_id
      WHERE jo.worker_user_id = $1
        AND jo.status IN ('accepted', 'rejected')
        AND jr.status IN ('assigned', 'completed', 'cancelled')
      ORDER BY jo.created_at DESC
      LIMIT 80
      `,
      [workerUserId],
    );

    return {
      workerUserId,
      jobs: rows.map((row) => ({
        offerId: row.offer_id,
        requestId: row.request_id,
        title: row.title,
        description: row.description,
        category: row.category,
        address: row.address,
        amount: Number(row.amount),
        offerStatus: row.offer_status,
        requestStatus: row.request_status,
        acceptedAt: row.accepted_at,
        threadId: row.thread_id ?? null,
        photoUrl: row.photo_url ?? null,
        client: {
          id: row.client_id,
          firstName: row.client_first_name,
          lastName: row.client_last_name ?? '',
          profilePhotoUrl: row.client_photo ?? null,
        },
      })),
    };
  }

  public async getClientHistory(clientUserId: string) {
    await this.repo.getUserById(clientUserId);

    const rows = await this.dataSource.query<any[]>(
      `
      SELECT jr.id AS request_id,
             jr.title,
             jr.description,
             jr.category,
             jr.address,
             jr.status AS request_status,
             jr.created_at,
             jo.id AS offer_id,
             jo.amount,
             jo.status AS offer_status,
             w.id AS worker_id,
             w.first_name AS worker_first_name,
             w.last_name AS worker_last_name,
             w.profile_photo_url AS worker_photo,
             ct.id AS thread_id,
             (SELECT p.url FROM job_request_photos p WHERE p.request_id = jr.id ORDER BY p.created_at ASC LIMIT 1) as photo_url
      FROM job_requests jr
      LEFT JOIN job_offers jo ON jo.request_id = jr.id AND jo.status IN ('accepted', 'rejected')
      LEFT JOIN users w ON w.id = jo.worker_user_id
      LEFT JOIN chat_threads ct
        ON ct.request_id = jr.id
       AND ct.worker_user_id = w.id
       AND ct.client_user_id = jr.client_user_id
      WHERE jr.client_user_id = $1
        AND jr.status IN ('assigned', 'completed', 'cancelled')
      ORDER BY jr.created_at DESC
      LIMIT 80
      `,
      [clientUserId],
    );

    return {
      clientUserId,
      jobs: rows.map((row) => ({
        requestId: row.request_id,
        title: row.title,
        description: row.description,
        category: row.category,
        address: row.address,
        amount: row.amount ? Number(row.amount) : null,
        offerId: row.offer_id ?? null,
        offerStatus: row.offer_status ?? null,
        requestStatus: row.request_status,
        createdAt: row.created_at,
        threadId: row.thread_id ?? null,
        photoUrl: row.photo_url ?? null,
        worker: row.worker_id
          ? {
              id: row.worker_id,
              firstName: row.worker_first_name,
              lastName: row.worker_last_name ?? '',
              profilePhotoUrl: row.worker_photo ?? null,
            }
          : null,
      })),
    };
  }
}
