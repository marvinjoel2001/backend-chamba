import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

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
};

@Injectable()
export class MobileService implements OnModuleInit {
  private static readonly OFFER_LIFETIME_SECONDS = 120;
  private static readonly DEFAULT_CATEGORY = 'General';
  private static readonly GEMINI_TIMEOUT_MS = 9000;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly storageService: StorageService,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSchema();
    await this.seedData();
  }

  async register(input: {
    type?: string;
    email: string;
    phone?: string;
    firstName: string;
    lastName?: string;
    password: string;
  }) {
    const type = (input.type ?? 'client').toLowerCase().trim();
    if (type !== 'client' && type !== 'worker') {
      throw new BadRequestException('type must be client or worker');
    }

    const email = input.email?.trim().toLowerCase();
    if (!email) {
      throw new BadRequestException('email is required');
    }

    const firstName = input.firstName?.trim();
    if (!firstName) {
      throw new BadRequestException('firstName is required');
    }

    const password = input.password?.trim();
    if (!password || password.length < 4) {
      throw new BadRequestException('password must be at least 4 characters');
    }

    const phone = this.normalizePhone(input.phone);
    const lastName = input.lastName?.trim() || null;

    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.query<any[]>(
        `
        SELECT id
        FROM users
        WHERE LOWER(email) = LOWER($1)
           OR (
             $2::text IS NOT NULL
             AND regexp_replace(COALESCE(phone, ''), '[^0-9]+', '', 'g') = $2
           )
        LIMIT 1
        `,
        [email, phone],
      );

      if (existing[0]) {
        throw new ConflictException('El correo o telefono ya esta registrado');
      }

      const createdRows = await manager.query<any[]>(
        `
        INSERT INTO users (
          type,
          email,
          phone,
          first_name,
          last_name,
          is_available
        )
        VALUES ($1, $2, $3, $4, $5, false)
        RETURNING id, type, first_name, last_name, email, phone, profile_photo_url
        `,
        [type, email, phone, firstName, lastName],
      );

      const created = createdRows[0];
      await manager.query(
        `
        INSERT INTO auth_credentials (user_id, password)
        VALUES ($1, $2)
        `,
        [created.id, password],
      );

      return {
        user: {
          id: created.id,
          type: created.type,
          firstName: created.first_name,
          lastName: created.last_name ?? null,
          email: created.email,
          phone: created.phone ?? null,
          profilePhotoUrl: created.profile_photo_url ?? null,
        },
      };
    });
  }

  async login(identifier: string, password: string) {
    if (!identifier?.trim() || !password?.trim()) {
      throw new BadRequestException('identifier and password are required');
    }

    const normalizedEmail = identifier.trim().toLowerCase();
    const normalizedPhone = this.normalizePhone(identifier);

    const rows = await this.dataSource.query<any[]>(
      `
      SELECT u.id,
             u.type,
             u.first_name,
             u.last_name,
             u.email,
             u.phone,
             u.profile_photo_url
      FROM users u
      JOIN auth_credentials c ON c.user_id = u.id
      WHERE (
          LOWER(u.email) = LOWER($1)
          OR (
            $2::text IS NOT NULL
            AND regexp_replace(COALESCE(u.phone, ''), '[^0-9]+', '', 'g') = $2
          )
        )
        AND c.password = $3
      LIMIT 1
      `,
      [normalizedEmail, normalizedPhone, password.trim()],
    );

    const row = rows[0];
    if (!row) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    return {
      user: {
        id: row.id,
        type: row.type,
        firstName: row.first_name,
        lastName: row.last_name ?? null,
        email: row.email,
        phone: row.phone ?? null,
        profilePhotoUrl: row.profile_photo_url ?? null,
      },
    };
  }

  async checkIdentifier(identifier: string) {
    const normalized = identifier?.trim();
    if (!normalized) {
      throw new BadRequestException('identifier is required');
    }

    const normalizedEmail = normalized.toLowerCase();
    const normalizedPhone = this.normalizePhone(normalized);

    const rows = await this.dataSource.query<any[]>(
      `
      SELECT id
      FROM users
      WHERE LOWER(email) = LOWER($1)
         OR (
           $2::text IS NOT NULL
           AND regexp_replace(COALESCE(phone, ''), '[^0-9]+', '', 'g') = $2
         )
      LIMIT 1
      `,
      [normalizedEmail, normalizedPhone],
    );

    return {
      exists: Boolean(rows[0]),
    };
  }

  async getExploreData(params: {
    userId: string;
    latitude?: number;
    longitude?: number;
    radiusKm?: number;
  }) {
    const user = await this.getUserById(params.userId);
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

    const activeRequest = await this.findLatestClientRequest(user.id);

    const topCategories = this.extractTopCategories(workerRows);
    const categories =
      topCategories.length > 0
        ? topCategories
        : await this.listFallbackCategories();

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
  async createRequest(input: CreateRequestInput) {
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
    const photos = this.validateBase64Images(input.photosBase64, 5);
    const uploadedPhotosInput = this.validateUploadedImages(input.photos, 5);
    const fallbackCategory =
      input.category?.trim() || MobileService.DEFAULT_CATEGORY;
    const aiCategoriesFromAi = await this.classifyRequestCategoriesWithAi({
      title: input.title,
      description: input.description,
      fallbackCategory,
    });
    const aiCategoriesInput = aiCategoriesFromAi.length
      ? aiCategoriesFromAi
      : input.aiCategories;
    const aiCategories = this.normalizeAiCategories(
      aiCategoriesInput,
      fallbackCategory,
    );
    const primaryCategory =
      aiCategories[0]?.name ||
      fallbackCategory ||
      MobileService.DEFAULT_CATEGORY;
    await this.ensureCategoriesExist([
      primaryCategory,
      ...aiCategories.map((item) => item.name),
    ]);

    await this.getUserById(input.clientUserId);

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
        status
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
        'searching'
      )
      RETURNING id, status, title, budget, address, ai_categories, created_at
      `,
      [
        input.clientUserId,
        input.title,
        input.description,
        primaryCategory,
        JSON.stringify(aiCategories),
        input.budget,
        input.priceType,
        input.scheduledAt ?? null,
        input.latitude,
        input.longitude,
        input.address,
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

    return {
      request: {
        id: created.id,
        status: created.status,
        title: created.title,
        budget: Number(created.budget),
        address: created.address,
        aiCategories: this.parseAiCategories(created.ai_categories),
        createdAt: created.created_at,
        photos: uploadedPhotos,
      },
      notifiedWorkers,
    };
  }

  async uploadProfilePhoto(params: {
    userId: string;
    imageBase64?: string;
    imageUrl?: string;
    imagePublicId?: string;
  }) {
    const user = await this.getUserByIdWithPhotoMeta(params.userId);
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
        user: await this.getUserById(params.userId),
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
      user: await this.getUserById(params.userId),
    };
  }

  async removeProfilePhoto(userId: string) {
    const user = await this.getUserByIdWithPhotoMeta(userId);

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
      user: await this.getUserById(userId),
    };
  }

  async deleteRequestPhoto(params: {
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

  async upsertPushToken(params: {
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

    await this.getUserById(params.userId);

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

  async getRequestStatus(params: {
    requestId?: string;
    clientUserId?: string;
  }) {
    const request = await this.resolveRequest(params);
    await this.expireStaleOffers(request.id);
    const photos = await this.getRequestPhotos(request.id);

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
             u.completed_jobs
      FROM job_offers jo
      JOIN users u ON u.id = jo.worker_user_id
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
      })),
    };
  }

  async getOffers(params: { requestId?: string; clientUserId?: string }) {
    const request = await this.resolveRequest(params);
    await this.expireStaleOffers(request.id);
    const photos = await this.getRequestPhotos(request.id);

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
             CASE
               WHEN u.current_location IS NOT NULL
                 THEN ST_Distance(u.current_location, jr.location) / 1000.0
               ELSE NULL
             END AS distance_km
      FROM job_offers jo
      JOIN users u ON u.id = jo.worker_user_id
      JOIN job_requests jr ON jr.id = jo.request_id
      LEFT JOIN skill_agg sa ON sa.user_id = u.id
      WHERE jo.request_id = $1
        AND jo.status = 'pending'
        AND (jo.expires_at IS NULL OR jo.expires_at > NOW())
      ORDER BY jo.amount ASC, u.average_rating DESC
      `,
      [request.id],
    );

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
      })),
      offerLifetimeSeconds: MobileService.OFFER_LIFETIME_SECONDS,
    };
  }
  async getWorkerProfile(workerId: string) {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT id,
             first_name,
             last_name,
             profile_photo_url,
             average_rating,
             completed_jobs,
             work_radius_km
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

  async getMessages(userId: string) {
    await this.getUserById(userId);

    const rows = await this.dataSource.query<any[]>(
      `
      SELECT t.id AS thread_id,
             t.request_id,
             CASE WHEN t.client_user_id = $1 THEN t.worker_user_id ELSE t.client_user_id END AS counterpart_id,
             u.first_name AS counterpart_first_name,
             u.last_name AS counterpart_last_name,
             u.profile_photo_url AS counterpart_photo,
             lm.content AS last_message,
             lm.created_at AS last_message_at
      FROM chat_threads t
      JOIN users u
        ON u.id = CASE WHEN t.client_user_id = $1 THEN t.worker_user_id ELSE t.client_user_id END
      LEFT JOIN LATERAL (
        SELECT m.content, m.created_at
        FROM chat_messages m
        WHERE m.thread_id = t.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) lm ON true
      WHERE t.client_user_id = $1 OR t.worker_user_id = $1
      ORDER BY COALESCE(lm.created_at, t.updated_at) DESC
      `,
      [userId],
    );

    return {
      threads: rows.map((row) => ({
        id: row.thread_id,
        requestId: row.request_id ?? null,
        counterpart: {
          id: row.counterpart_id,
          firstName: row.counterpart_first_name,
          lastName: row.counterpart_last_name ?? '',
          profilePhotoUrl: row.counterpart_photo ?? null,
        },
        lastMessage: row.last_message ?? 'Sin mensajes',
        lastMessageAt: row.last_message_at ?? null,
      })),
    };
  }

  async getThreadMessages(threadId: string) {
    await this.ensureThreadExists(threadId);

    const rows = await this.dataSource.query<any[]>(
      `
      SELECT id, sender_user_id, content, created_at
      FROM chat_messages
      WHERE thread_id = $1
      ORDER BY created_at ASC
      `,
      [threadId],
    );

    return {
      threadId,
      messages: rows.map((row) => ({
        id: row.id,
        senderUserId: row.sender_user_id,
        content: row.content,
        createdAt: row.created_at,
      })),
    };
  }

  async sendMessage(params: {
    threadId: string;
    senderUserId: string;
    content: string;
  }) {
    if (!params.content?.trim()) {
      throw new BadRequestException('content is required');
    }

    await this.getUserById(params.senderUserId);
    await this.ensureThreadExists(params.threadId);

    const rows = await this.dataSource.query<any[]>(
      `
      INSERT INTO chat_messages (thread_id, sender_user_id, content)
      VALUES ($1, $2, $3)
      RETURNING id, sender_user_id, content, created_at
      `,
      [params.threadId, params.senderUserId, params.content.trim()],
    );

    await this.dataSource.query(
      `UPDATE chat_threads SET updated_at = NOW() WHERE id = $1`,
      [params.threadId],
    );

    const threadRows = await this.dataSource.query<any[]>(
      `
      SELECT request_id, client_user_id, worker_user_id
      FROM chat_threads
      WHERE id = $1
      LIMIT 1
      `,
      [params.threadId],
    );

    const thread = threadRows[0];
    const payload = {
      threadId: params.threadId,
      requestId: thread?.request_id ?? null,
      message: {
        id: rows[0].id,
        senderUserId: rows[0].sender_user_id,
        content: rows[0].content,
        createdAt: rows[0].created_at,
      },
    };
    this.realtimeGateway.emitToThread(params.threadId, 'message.new', payload);
    if (thread?.client_user_id) {
      this.realtimeGateway.emitToUser(
        thread.client_user_id,
        'message.new',
        payload,
      );
    }
    if (thread?.worker_user_id) {
      this.realtimeGateway.emitToUser(
        thread.worker_user_id,
        'message.new',
        payload,
      );
    }

    return {
      message: {
        id: rows[0].id,
        senderUserId: rows[0].sender_user_id,
        content: rows[0].content,
        createdAt: rows[0].created_at,
      },
    };
  }

  async getIncomingRequest(workerUserId: string) {
    await this.expireStaleOffers();
    await this.getUserById(workerUserId);

    const rows = await this.dataSource.query<any[]>(
      `
      SELECT jr.id AS request_id,
             jr.title,
             jr.description,
             jr.category,
             jr.budget,
             jr.address,
             jr.status,
             CASE
               WHEN w.current_location IS NOT NULL
                 THEN ST_Distance(jr.location, w.current_location) / 1000.0
               ELSE NULL
             END AS distance_km,
             c.id AS client_id,
             c.first_name AS client_first_name,
             c.last_name AS client_last_name,
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
        AND (
          (
            jr.status IN ('searching', 'negotiating')
            AND w.current_location IS NOT NULL
            AND ST_DWithin(
              jr.location,
              w.current_location,
              w.work_radius_km * 1000
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
      LIMIT 1
      `,
      [workerUserId],
    );

    const row = rows[0];
    if (!row) {
      return { request: null };
    }

    return {
      offerLifetimeSeconds: MobileService.OFFER_LIFETIME_SECONDS,
      request: {
        id: row.request_id,
        title: row.title,
        description: row.description,
        category: row.category,
        budget: Number(row.budget),
        address: row.address,
        status: row.status,
        distanceKm: row.distance_km == null ? null : Number(row.distance_km),
        client: {
          id: row.client_id,
          name: `${row.client_first_name} ${row.client_last_name ?? ''}`.trim(),
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
      },
    };
  }
  async upsertOffer(params: {
    requestId: string;
    workerUserId: string;
    amount: number;
    message?: string;
  }) {
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
      throw new BadRequestException('amount must be greater than 0');
    }

    await this.expireStaleOffers(params.requestId);
    await this.getUserById(params.workerUserId);
    const request = await this.getRequestById(params.requestId);
    if (!['searching', 'negotiating'].includes(request.status)) {
      throw new BadRequestException('La solicitud ya no admite nuevas ofertas');
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
      const rows = await this.dataSource.query<any[]>(
        `
        UPDATE job_offers
        SET amount = $2,
            message = $3,
            status = 'pending',
            expires_at = NOW() + ($4::int * INTERVAL '1 second'),
            created_at = NOW()
        WHERE id = $1
        RETURNING id
        `,
        [
          existingRows[0].id,
          params.amount,
          params.message ?? null,
          MobileService.OFFER_LIFETIME_SECONDS,
        ],
      );
      offerId = rows[0].id;
    } else {
      const rows = await this.dataSource.query<any[]>(
        `
        INSERT INTO job_offers (request_id, worker_user_id, amount, message, status, expires_at)
        VALUES ($1, $2, $3, $4, 'pending', NOW() + ($5::int * INTERVAL '1 second'))
        RETURNING id
        `,
        [
          params.requestId,
          params.workerUserId,
          params.amount,
          params.message ?? null,
          MobileService.OFFER_LIFETIME_SECONDS,
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

    await this.ensureThreadAndInitialMessage({
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
      offerLifetimeSeconds: MobileService.OFFER_LIFETIME_SECONDS,
    };
    this.realtimeGateway.emitToUser(
      request.client_user_id,
      'offer.new',
      offerPayload,
    );
    this.realtimeGateway.emitToUser(
      params.workerUserId,
      'offer.updated',
      offerPayload,
    );

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

  async acceptOffer(params: { offerId: string; clientUserId: string }) {
    await this.expireStaleOffers();
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT jo.id,
             jo.request_id,
             jo.worker_user_id,
             jr.client_user_id
      FROM job_offers jo
      JOIN job_requests jr ON jr.id = jo.request_id
      WHERE jo.id = $1
        AND jo.status <> 'expired'
        AND (jo.expires_at IS NULL OR jo.expires_at > NOW())
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

    const rejectedRows = await this.dataSource.query<any[]>(
      `
      UPDATE job_offers
      SET status = 'rejected'
      WHERE request_id = $1
        AND id <> $2
        AND status <> 'expired'
      RETURNING id, worker_user_id
      `,
      [offer.request_id, params.offerId],
    );
    await this.dataSource.query(
      `UPDATE job_offers SET status = 'accepted' WHERE id = $1`,
      [params.offerId],
    );
    await this.dataSource.query(
      `UPDATE job_requests SET status = 'assigned', updated_at = NOW() WHERE id = $1`,
      [offer.request_id],
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

    return {
      accepted: true,
      requestId: offer.request_id,
      workerUserId: offer.worker_user_id,
    };
  }

  async getTracking(requestId: string) {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT jr.id AS request_id,
             jr.address AS request_address,
             w.id AS worker_id,
             w.first_name AS worker_first_name,
             w.last_name AS worker_last_name,
             w.profile_photo_url AS worker_photo,
             CASE
               WHEN w.current_location IS NOT NULL
                 THEN ST_Distance(w.current_location, jr.location) / 1000.0
               ELSE NULL
             END AS distance_km,
             jo.amount
      FROM job_requests jr
      JOIN job_offers jo ON jo.request_id = jr.id AND jo.status = 'accepted'
      JOIN users w ON w.id = jo.worker_user_id
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
      address: row.request_address,
      distanceKm,
      etaMinutes:
        distanceKm == null ? null : Math.max(5, Math.ceil(distanceKm / 0.5)),
      agreedAmount: Number(row.amount),
      worker: {
        id: row.worker_id,
        firstName: row.worker_first_name,
        lastName: row.worker_last_name ?? '',
        profilePhotoUrl: row.worker_photo ?? null,
      },
    };
  }

  async getWorkerRadar(workerUserId: string) {
    const worker = await this.getUserById(workerUserId);

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
          AND w.current_location IS NOT NULL
          AND jr.status IN ('searching', 'negotiating')
          AND ST_DWithin(jr.location, w.current_location, w.work_radius_km * 1000)
      )
      SELECT jobs.jobs_today, jobs.earnings_today, nearby.nearby_requests
      FROM jobs, nearby
      `,
      [workerUserId],
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

  async setWorkerAvailability(workerUserId: string, available: boolean) {
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

  async updateWorkerLocation(params: {
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

    return {
      workerId: rows[0].id,
      latitude: Number(rows[0].latitude),
      longitude: Number(rows[0].longitude),
    };
  }

  async getWorkerSkills(workerUserId: string) {
    await this.getUserById(workerUserId);

    const rows = await this.dataSource.query<any[]>(
      `SELECT skill FROM worker_skills WHERE user_id = $1 ORDER BY skill ASC`,
      [workerUserId],
    );

    return {
      workerUserId,
      skills: rows.map((row) => row.skill),
    };
  }

  async listCategories() {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT id,
             name,
             description,
             icon,
             parent_id,
             is_active,
             created_at,
             updated_at
      FROM categories
      WHERE is_active = true
      ORDER BY name ASC
      `,
    );

    return {
      categories: rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description ?? '',
        icon: row.icon ?? null,
        parentId: row.parent_id ?? null,
        active: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    };
  }

  async createCategory(input: {
    id?: string;
    name: string;
    description?: string;
    icon?: string;
    parentId?: string;
    active?: boolean;
  }) {
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('name is required');
    }

    const id = (input.id?.trim() || this.toCategoryId(name)).toLowerCase();
    if (!/^[a-z0-9_]+$/.test(id)) {
      throw new BadRequestException(
        'id must contain only lowercase letters, numbers and underscore',
      );
    }

    if (input.parentId?.trim()) {
      const parentRows = await this.dataSource.query<any[]>(
        `SELECT id FROM categories WHERE id = $1 LIMIT 1`,
        [input.parentId.trim().toLowerCase()],
      );
      if (!parentRows[0]) {
        throw new BadRequestException('parentId not found');
      }
    }

    const rows = await this.dataSource.query<any[]>(
      `
      INSERT INTO categories (id, name, description, icon, parent_id, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id)
      DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        icon = EXCLUDED.icon,
        parent_id = EXCLUDED.parent_id,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id, name, description, icon, parent_id, is_active, created_at, updated_at
      `,
      [
        id,
        name,
        input.description?.trim() || '',
        input.icon?.trim() || null,
        input.parentId?.trim().toLowerCase() || null,
        input.active ?? true,
      ],
    );

    return {
      category: {
        id: rows[0].id,
        name: rows[0].name,
        description: rows[0].description ?? '',
        icon: rows[0].icon ?? null,
        parentId: rows[0].parent_id ?? null,
        active: rows[0].is_active,
        createdAt: rows[0].created_at,
        updatedAt: rows[0].updated_at,
      },
    };
  }

  async updateWorkerSkills(workerUserId: string, skills: string[]) {
    await this.getUserById(workerUserId);

    const sanitized = [
      ...new Set((skills ?? []).map((item) => item.trim()).filter(Boolean)),
    ].slice(0, 20);
    await this.ensureCategoriesExist(sanitized);

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

  async getWorkerHistory(workerUserId: string) {
    await this.getUserById(workerUserId);

    const rows = await this.dataSource.query<any[]>(
      `
      SELECT jo.id AS offer_id,
             jo.amount,
             jo.status,
             jo.created_at AS accepted_at,
             jr.id AS request_id,
             jr.title,
             jr.description,
             jr.category,
             jr.address,
             c.id AS client_id,
             c.first_name AS client_first_name,
             c.last_name AS client_last_name,
             c.profile_photo_url AS client_photo,
             ct.id AS thread_id
      FROM job_offers jo
      JOIN job_requests jr ON jr.id = jo.request_id
      JOIN users c ON c.id = jr.client_user_id
      LEFT JOIN chat_threads ct
        ON ct.request_id = jr.id
       AND ct.worker_user_id = jo.worker_user_id
       AND ct.client_user_id = jr.client_user_id
      WHERE jo.worker_user_id = $1
        AND jo.status = 'accepted'
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
        status: row.status,
        acceptedAt: row.accepted_at,
        threadId: row.thread_id ?? null,
        client: {
          id: row.client_id,
          firstName: row.client_first_name,
          lastName: row.client_last_name ?? '',
          profilePhotoUrl: row.client_photo ?? null,
        },
      })),
    };
  }

  async createReview(params: {
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

    await this.getUserById(params.workerUserId);
    await this.getUserById(params.clientUserId);
    await this.getRequestById(params.requestId);

    await this.dataSource.query(
      `
      INSERT INTO worker_reviews (request_id, worker_user_id, client_user_id, stars, comment)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [
        params.requestId,
        params.workerUserId,
        params.clientUserId,
        params.stars,
        params.comment ?? null,
      ],
    );

    const rows = await this.dataSource.query<any[]>(
      `
      SELECT COALESCE(AVG(stars), 0) AS average_rating,
             COUNT(*)::text AS completed_jobs
      FROM worker_reviews
      WHERE worker_user_id = $1
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

    return {
      saved: true,
      workerUserId: params.workerUserId,
      averageRating: Number(rows[0]?.average_rating ?? 0),
      completedJobs: Number(rows[0]?.completed_jobs ?? 0),
    };
  }
  private async ensureSchema(): Promise<void> {
    const statements = [
      `CREATE EXTENSION IF NOT EXISTS postgis;`,
      `CREATE EXTENSION IF NOT EXISTS pgcrypto;`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_public_id TEXT NULL;`,
      `
      CREATE TABLE IF NOT EXISTS auth_credentials (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        password TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      `,
      `
      CREATE TABLE IF NOT EXISTS job_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        budget NUMERIC(12,2) NOT NULL,
        price_type TEXT NOT NULL,
        scheduled_at TIMESTAMPTZ NULL,
        location GEOGRAPHY(Point, 4326) NOT NULL,
        address TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'searching',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      `,
      `ALTER TABLE job_requests ADD COLUMN IF NOT EXISTS ai_categories JSONB NOT NULL DEFAULT '[]'::jsonb;`,
      `
      CREATE TABLE IF NOT EXISTS job_offers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id UUID NOT NULL REFERENCES job_requests(id) ON DELETE CASCADE,
        worker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount NUMERIC(12,2) NOT NULL,
        message TEXT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        expires_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (request_id, worker_user_id)
      );
      `,
      `ALTER TABLE job_offers ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL;`,
      `
      CREATE TABLE IF NOT EXISTS chat_threads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id UUID NULL REFERENCES job_requests(id) ON DELETE SET NULL,
        client_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        worker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (request_id, client_user_id, worker_user_id)
      );
      `,
      `
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        thread_id UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
        sender_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      `,
      `
      CREATE TABLE IF NOT EXISTS worker_skills (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        skill TEXT NOT NULL,
        PRIMARY KEY (user_id, skill)
      );
      `,
      `
      CREATE TABLE IF NOT EXISTS worker_reviews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id UUID NOT NULL REFERENCES job_requests(id) ON DELETE CASCADE,
        worker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        client_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        stars INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
        comment TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      `,
      `
      CREATE TABLE IF NOT EXISTS job_request_photos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id UUID NOT NULL REFERENCES job_requests(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        public_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      `,
      `
      CREATE TABLE IF NOT EXISTS push_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        platform TEXT NOT NULL DEFAULT 'unknown',
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      `,
      `
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT NULL,
        icon TEXT NULL,
        parent_id TEXT NULL REFERENCES categories(id) ON DELETE SET NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      `,
      `CREATE INDEX IF NOT EXISTS idx_job_requests_location ON job_requests USING GIST(location);`,
      `CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created ON chat_messages(thread_id, created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_job_offers_request ON job_offers(request_id);`,
      `CREATE INDEX IF NOT EXISTS idx_job_request_photos_request ON job_request_photos(request_id);`,
      `CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);`,
      `CREATE INDEX IF NOT EXISTS idx_categories_active_name ON categories(is_active, name);`,
    ];

    for (const statement of statements) {
      await this.dataSource.query(statement);
    }
  }

  private async seedData(): Promise<void> {
    await this.seedDefaultCategories();

    const demoUsers = [
      {
        type: 'client',
        email: 'cliente.demo@chamba.app',
        phone: '+59170000001',
        firstName: 'Carla',
        lastName: 'Mendoza',
        profilePhotoUrl:
          'https://images.unsplash.com/photo-1494790108377-be9c29b29330',
        latitude: -16.5002,
        longitude: -68.1342,
        isAvailable: false,
        workRadiusKm: 5,
        averageRating: 0,
        completedJobs: 0,
        skills: [] as string[],
      },
      {
        type: 'worker',
        email: 'worker.roberto@chamba.app',
        phone: '+59170000011',
        firstName: 'Roberto',
        lastName: 'Gomez',
        profilePhotoUrl:
          'https://images.unsplash.com/photo-1500648767791-00dcc994a43e',
        latitude: -16.4965,
        longitude: -68.129,
        isAvailable: true,
        workRadiusKm: 8,
        averageRating: 4.9,
        completedJobs: 124,
        skills: ['Pintura', 'Construccion', 'Acabados'],
      },
      {
        type: 'worker',
        email: 'worker.elena@chamba.app',
        phone: '+59170000012',
        firstName: 'Elena',
        lastName: 'Morales',
        profilePhotoUrl:
          'https://images.unsplash.com/photo-1500917293891-ef795e70e1f6',
        latitude: -16.491,
        longitude: -68.122,
        isAvailable: true,
        workRadiusKm: 7,
        averageRating: 4.8,
        completedJobs: 86,
        skills: ['Pintura', 'Decoracion'],
      },
      {
        type: 'worker',
        email: 'worker.marcos@chamba.app',
        phone: '+59170000013',
        firstName: 'Marcos',
        lastName: 'Quispe',
        profilePhotoUrl:
          'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d',
        latitude: -16.506,
        longitude: -68.139,
        isAvailable: true,
        workRadiusKm: 10,
        averageRating: 4.7,
        completedJobs: 210,
        skills: ['Pintura', 'Plomeria', 'Electricidad'],
      },
    ];

    const userIdsByEmail = new Map<string, string>();
    for (const demoUser of demoUsers) {
      const rows = await this.dataSource.query<any[]>(
        `
        INSERT INTO users (
          type,
          email,
          phone,
          first_name,
          last_name,
          profile_photo_url,
          current_location,
          work_radius_km,
          average_rating,
          completed_jobs,
          is_available
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          ST_SetSRID(ST_MakePoint($8::float8, $7::float8), 4326)::geography,
          $9,
          $10,
          $11,
          $12
        )
        ON CONFLICT (email)
        DO UPDATE SET
          type = EXCLUDED.type,
          phone = EXCLUDED.phone,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          profile_photo_url = EXCLUDED.profile_photo_url,
          current_location = EXCLUDED.current_location,
          work_radius_km = EXCLUDED.work_radius_km,
          average_rating = EXCLUDED.average_rating,
          completed_jobs = EXCLUDED.completed_jobs,
          is_available = EXCLUDED.is_available,
          updated_at = NOW()
        RETURNING id
        `,
        [
          demoUser.type,
          demoUser.email,
          demoUser.phone,
          demoUser.firstName,
          demoUser.lastName,
          demoUser.profilePhotoUrl,
          demoUser.latitude,
          demoUser.longitude,
          demoUser.workRadiusKm,
          demoUser.averageRating,
          demoUser.completedJobs,
          demoUser.isAvailable,
        ],
      );

      const userId = rows[0]?.id;
      if (!userId) {
        continue;
      }

      userIdsByEmail.set(demoUser.email, userId);

      await this.dataSource.query(
        `
        INSERT INTO auth_credentials (user_id, password)
        VALUES ($1, '123456')
        ON CONFLICT (user_id) DO UPDATE SET password = EXCLUDED.password
        `,
        [userId],
      );

      if (demoUser.type === 'worker') {
        await this.dataSource.query(
          `DELETE FROM worker_skills WHERE user_id = $1`,
          [userId],
        );
        for (const skill of demoUser.skills) {
          await this.dataSource.query(
            `INSERT INTO worker_skills (user_id, skill) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [userId, skill],
          );
        }
      }
    }

    const countRows = await this.dataSource.query<any[]>(
      `SELECT COUNT(*)::text AS count FROM job_requests`,
    );
    if (Number(countRows[0]?.count ?? 0) > 0) {
      return;
    }

    const clientId = userIdsByEmail.get('cliente.demo@chamba.app');
    if (!clientId) {
      return;
    }

    const created = await this.createRequest({
      clientUserId: clientId,
      title: 'Pintado de fachada exterior',
      description:
        'Necesito pintor con experiencia para retoques en fachada de vivienda unifamiliar.',
      category: 'Pintura',
      budget: 100,
      priceType: 'Por dia',
      address: 'Av. Arce, Edificio Multicine',
      latitude: -16.502,
      longitude: -68.132,
      scheduledAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
    });

    const offers = await this.getOffers({ requestId: created.request.id });
    const firstOffer = offers.offers[0];

    if (firstOffer) {
      await this.acceptOffer({
        offerId: firstOffer.id,
        clientUserId: clientId,
      });
    }
  }

  private async seedDefaultCategories() {
    const defaults = [
      {
        id: 'construccion',
        name: 'Construccion',
        description: 'Albanileria, techos, pisos, demolicion',
      },
      {
        id: 'electricidad',
        name: 'Electricidad',
        description: 'Instalaciones domesticas e industriales',
      },
      {
        id: 'plomeria',
        name: 'Plomeria',
        description: 'Tuberias, fugas y sanitarios',
      },
      {
        id: 'jardineria',
        name: 'Jardineria',
        description: 'Poda, riego y mantenimiento de jardines',
      },
      {
        id: 'transporte',
        name: 'Transporte',
        description: 'Chofer, mudanzas y mensajeria',
      },
      {
        id: 'limpieza',
        name: 'Limpieza',
        description: 'Hogares, oficinas y post-obra',
      },
      {
        id: 'mecanica',
        name: 'Mecanica',
        description: 'Mecanica y mantenimiento automotriz',
      },
      {
        id: 'carpinteria',
        name: 'Carpinteria',
        description: 'Muebles, puertas y ventanas',
      },
      {
        id: 'pintura',
        name: 'Pintura',
        description: 'Pintura interior y exterior',
      },
      {
        id: 'trabajo_general',
        name: 'General',
        description: 'Ayudante general y tareas varias',
      },
    ];

    for (const category of defaults) {
      await this.dataSource.query(
        `
        INSERT INTO categories (id, name, description, is_active)
        VALUES ($1, $2, $3, true)
        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          is_active = true,
          updated_at = NOW()
        `,
        [category.id, category.name, category.description],
      );
    }
  }

  private extractTopCategories(
    workerRows: Array<{ skills?: string[] | null }>,
  ) {
    const counter = new Map<string, number>();

    for (const row of workerRows) {
      for (const skill of row.skills ?? []) {
        counter.set(skill, (counter.get(skill) ?? 0) + 1);
      }
    }

    return [...counter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([skill]) => skill);
  }

  private async listFallbackCategories() {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT name
      FROM categories
      WHERE is_active = true
      ORDER BY name ASC
      LIMIT 8
      `,
    );

    return rows.map((row) => String(row.name ?? '').trim()).filter(Boolean);
  }

  private async resolveRequest(params: {
    requestId?: string;
    clientUserId?: string;
  }) {
    if (params.requestId) {
      return this.getRequestById(params.requestId);
    }

    if (!params.clientUserId) {
      throw new BadRequestException('requestId or clientUserId is required');
    }

    const request = await this.findLatestClientRequest(params.clientUserId);
    if (!request) {
      throw new NotFoundException('No request found');
    }

    return request;
  }

  private async findLatestClientRequest(clientUserId: string) {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT id,
             client_user_id,
             title,
             description,
             category,
             ai_categories,
             budget,
             price_type,
             address,
             status,
             created_at
      FROM job_requests
      WHERE client_user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [clientUserId],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      clientUserId: row.client_user_id,
      title: row.title,
      description: row.description,
      category: row.category,
      aiCategories: this.parseAiCategories(row.ai_categories),
      budget: Number(row.budget),
      priceType: row.price_type,
      address: row.address,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  private async getRequestById(requestId: string) {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT id,
             client_user_id,
             title,
             description,
             category,
             ai_categories,
             budget,
             price_type,
             address,
             status,
             location,
             created_at
      FROM job_requests
      WHERE id = $1
      LIMIT 1
      `,
      [requestId],
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundException('Request not found');
    }

    return {
      id: row.id,
      client_user_id: row.client_user_id,
      title: row.title,
      description: row.description,
      category: row.category,
      aiCategories: this.parseAiCategories(row.ai_categories),
      budget: Number(row.budget),
      price_type: row.price_type,
      address: row.address,
      status: row.status,
      location: row.location,
      created_at: row.created_at,
    };
  }

  private async getUserById(userId: string) {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT id,
             type,
             first_name,
             last_name,
             email,
             phone,
             profile_photo_url,
             profile_photo_public_id,
             is_available,
             work_radius_km,
             ST_Y(current_location::geometry) AS current_latitude,
             ST_X(current_location::geometry) AS current_longitude
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [userId],
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundException('User not found');
    }

    return {
      id: row.id,
      type: row.type,
      firstName: row.first_name,
      lastName: row.last_name ?? null,
      email: row.email,
      phone: row.phone ?? null,
      profilePhotoUrl: row.profile_photo_url ?? null,
      profilePhotoPublicId: row.profile_photo_public_id ?? null,
      isAvailable: row.is_available,
      workRadiusKm: Number(row.work_radius_km ?? 0),
      currentLatitude:
        row.current_latitude == null ? null : Number(row.current_latitude),
      currentLongitude:
        row.current_longitude == null ? null : Number(row.current_longitude),
    };
  }

  private async getUserByIdWithPhotoMeta(userId: string) {
    return this.getUserById(userId);
  }

  private normalizePhone(value?: string | null): string | null {
    const digits = String(value ?? '').replace(/\D+/g, '');
    if (!digits) {
      return null;
    }
    if (digits.length === 9 && digits.startsWith('0')) {
      return digits.slice(1);
    }
    if (digits.length > 8 && digits.startsWith('591')) {
      return digits.slice(-8);
    }
    return digits;
  }

  private normalizeAiCategories(
    input: unknown,
    fallbackCategory: string,
  ): Array<{ id: string; name: string; confidence: number }> {
    if (!Array.isArray(input) || input.length === 0) {
      return [
        {
          id: this.toCategoryId(fallbackCategory),
          name: fallbackCategory.trim() || 'General',
          confidence: 0.5,
        },
      ];
    }

    const normalized: Array<{ id: string; name: string; confidence: number }> =
      [];
    for (const item of input.slice(0, 3)) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const data = item as Record<string, unknown>;
      const rawName = String(
        data.name ?? data.nombre ?? fallbackCategory ?? 'General',
      ).trim();
      const safeName = rawName || 'General';
      const rawId = String(data.id ?? this.toCategoryId(safeName))
        .trim()
        .toLowerCase();
      const confidence = Number(data.confidence ?? data.confianza ?? 0.5);
      normalized.push({
        id: rawId || this.toCategoryId(safeName),
        name: safeName,
        confidence: Number.isFinite(confidence)
          ? Math.max(0, Math.min(1, confidence))
          : 0.5,
      });
    }

    if (normalized.length === 0) {
      return [
        {
          id: this.toCategoryId(fallbackCategory),
          name: fallbackCategory.trim() || 'General',
          confidence: 0.5,
        },
      ];
    }

    return normalized;
  }

  private parseAiCategories(
    value: unknown,
  ): Array<{ id: string; name: string; confidence: number }> {
    if (!value) {
      return [];
    }

    let parsed: unknown = value;
    if (typeof value === 'string') {
      try {
        parsed = JSON.parse(value);
      } catch (_) {
        return [];
      }
    }

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => item as Record<string, unknown>)
      .map((item) => ({
        id: String(item.id ?? '').trim(),
        name: String(item.name ?? '').trim(),
        confidence: Number(item.confidence ?? 0),
      }))
      .filter((item) => Boolean(item.id) && Boolean(item.name))
      .slice(0, 3);
  }

  private async classifyRequestCategoriesWithAi(params: {
    title: string;
    description: string;
    fallbackCategory: string;
  }): Promise<Array<{ id: string; name: string; confidence: number }>> {
    const fallbackCategory =
      params.fallbackCategory?.trim() || MobileService.DEFAULT_CATEGORY;
    const catalog = await this.listActiveCategoryCatalogForAi();
    if (catalog.length === 0) {
      return [
        {
          id: this.toCategoryId(fallbackCategory),
          name: fallbackCategory,
          confidence: 0.5,
        },
      ];
    }

    const geminiApiKey =
      this.configService.get<string>('GEMINI_API_KEY')?.trim() ?? '';
    if (!geminiApiKey) {
      return [
        {
          id: this.toCategoryId(fallbackCategory),
          name: fallbackCategory,
          confidence: 0.5,
        },
      ];
    }

    const geminiModel =
      this.configService.get<string>('GEMINI_MODEL')?.trim() ||
      'gemini-2.0-flash';

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
4) Maximo 3 categorias.
5) El "id" y "nombre" deben pertenecer al catalogo permitido.
6) Si hay duda, incluye "trabajo_general" / "General".
7) No agregues texto fuera del JSON.
`.trim();

    const endpoint = new URL(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        geminiModel,
      )}:generateContent`,
    );
    endpoint.searchParams.set('key', geminiApiKey);

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      MobileService.GEMINI_TIMEOUT_MS,
    );

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            maxOutputTokens: 240,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return [
          {
            id: this.toCategoryId(fallbackCategory),
            name: fallbackCategory,
            confidence: 0.5,
          },
        ];
      }

      const payload = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      const text =
        payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
      if (!text) {
        return [
          {
            id: this.toCategoryId(fallbackCategory),
            name: fallbackCategory,
            confidence: 0.5,
          },
        ];
      }

      const parsed = this.parseAiCategoriesFromGeminiText({
        text,
        catalog,
        fallbackCategory,
      });
      if (parsed.length > 0) {
        return parsed;
      }

      return [
        {
          id: this.toCategoryId(fallbackCategory),
          name: fallbackCategory,
          confidence: 0.5,
        },
      ];
    } catch (_) {
      return [
        {
          id: this.toCategoryId(fallbackCategory),
          name: fallbackCategory,
          confidence: 0.5,
        },
      ];
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseAiCategoriesFromGeminiText(params: {
    text: string;
    catalog: Array<{ id: string; name: string }>;
    fallbackCategory: string;
  }): Array<{ id: string; name: string; confidence: number }> {
    const byId = new Map(
      params.catalog.map((item) => [item.id.trim().toLowerCase(), item]),
    );
    const byName = new Map(
      params.catalog.map((item) => [item.name.trim().toLowerCase(), item]),
    );

    let decoded: unknown;
    try {
      decoded = JSON.parse(params.text);
    } catch (_) {
      const start = params.text.indexOf('{');
      const end = params.text.lastIndexOf('}');
      if (start < 0 || end <= start) {
        return [];
      }
      try {
        decoded = JSON.parse(params.text.slice(start, end + 1));
      } catch (_) {
        return [];
      }
    }

    if (!decoded || typeof decoded !== 'object') {
      return [];
    }
    const rawCategories = (decoded as Record<string, unknown>).categorias;
    if (!Array.isArray(rawCategories)) {
      return [];
    }

    const output: Array<{ id: string; name: string; confidence: number }> = [];
    const seen = new Set<string>();
    for (const item of rawCategories.slice(0, 3)) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const row = item as Record<string, unknown>;
      const rawId = String(row.id ?? '')
        .trim()
        .toLowerCase();
      const rawName = String(row.nombre ?? row.name ?? '').trim();

      const resolved =
        (rawId ? byId.get(rawId) : undefined) ??
        (rawName ? byName.get(rawName.toLowerCase()) : undefined) ??
        (rawName
          ? params.catalog.find((category) =>
              category.name.toLowerCase().includes(rawName.toLowerCase()),
            )
          : undefined);

      const name = resolved?.name || rawName || params.fallbackCategory;
      const id = resolved?.id || rawId || this.toCategoryId(name);
      if (!id || !name || seen.has(id)) {
        continue;
      }
      seen.add(id);

      const confidenceRaw = Number(row.confianza ?? row.confidence ?? 0.5);
      output.push({
        id,
        name,
        confidence: Number.isFinite(confidenceRaw)
          ? Math.max(0, Math.min(1, confidenceRaw))
          : 0.5,
      });
    }

    output.sort((a, b) => b.confidence - a.confidence);
    return output;
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
        name: MobileService.DEFAULT_CATEGORY,
      });
    }
    return catalog;
  }

  private toCategoryId(value: string) {
    return (
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'trabajo_general'
    );
  }

  private validateBase64Images(input: unknown, limit: number): string[] {
    if (!Array.isArray(input)) {
      return [];
    }

    const values = input
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);

    if (values.length > limit) {
      throw new BadRequestException(`Maximum ${limit} images are allowed`);
    }

    for (const value of values) {
      this.ensureDataUri(value);
    }

    return values;
  }

  private ensureDataUri(value: string): void {
    const pattern = /^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\n\r]+$/;
    if (!pattern.test(value)) {
      throw new UnsupportedMediaTypeException(
        'Only base64 image data URI payloads are supported',
      );
    }
  }

  private validateUploadedImages(
    images: Array<{ url?: string; publicId?: string }> | undefined,
    limit: number,
  ) {
    if (!images || images.length === 0) {
      return [] as Array<{ url: string; publicId: string }>;
    }

    if (images.length > limit) {
      throw new BadRequestException(`Maximum ${limit} images are allowed`);
    }

    return images.map((item, index) => {
      const url = item?.url?.trim();
      const publicId = item?.publicId?.trim();

      if (!url || !publicId) {
        throw new BadRequestException(
          `photos[${index}] must include url and publicId`,
        );
      }

      this.ensureSecureImageUrl(url);
      return { url, publicId };
    });
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

  private async getRequestPhotos(requestId: string) {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT id, url, created_at
      FROM job_request_photos
      WHERE request_id = $1
      ORDER BY created_at ASC
      `,
      [requestId],
    );

    return rows.map((row) => ({
      id: row.id,
      url: row.url,
      createdAt: row.created_at,
    }));
  }

  private async ensureThreadExists(threadId: string) {
    const rows = await this.dataSource.query<any[]>(
      `SELECT id FROM chat_threads WHERE id = $1 LIMIT 1`,
      [threadId],
    );

    if (!rows[0]) {
      throw new NotFoundException('Thread not found');
    }
  }

  private async ensureThreadAndInitialMessage(params: {
    requestId: string;
    clientUserId: string;
    workerUserId: string;
    introMessage: string;
  }) {
    const rows = await this.dataSource.query<any[]>(
      `
      INSERT INTO chat_threads (request_id, client_user_id, worker_user_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (request_id, client_user_id, worker_user_id)
      DO UPDATE SET updated_at = NOW()
      RETURNING id
      `,
      [params.requestId, params.clientUserId, params.workerUserId],
    );

    const threadId = rows[0].id;

    const existing = await this.dataSource.query<any[]>(
      `SELECT id FROM chat_messages WHERE thread_id = $1 LIMIT 1`,
      [threadId],
    );

    if (!existing[0]) {
      await this.dataSource.query(
        `
        INSERT INTO chat_messages (thread_id, sender_user_id, content)
        VALUES ($1, $2, $3)
        `,
        [threadId, params.workerUserId, params.introMessage],
      );
    }

    return threadId;
  }

  private async seedOffersForRequest(requestId: string, baseBudget: number) {
    const request = await this.getRequestById(requestId);
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

    const workers = await this.dataSource.query<any[]>(
      `
      SELECT u.id,
             ST_Distance(u.current_location, $1::geography) / 1000.0 AS distance_km
      FROM users u
      WHERE u.type = 'worker'
        AND u.is_available = true
        AND u.current_location IS NOT NULL
        AND ST_DWithin(u.current_location, $1::geography, u.work_radius_km * 1000)
        AND (
          cardinality($2::text[]) = 0
          OR EXISTS (
            SELECT 1
            FROM worker_skills ws
            WHERE ws.user_id = u.id
              AND LOWER(ws.skill) = ANY($2::text[])
          )
        )
      ORDER BY ST_Distance(u.current_location, $1::geography) ASC
      `,
      [request.location, normalizedSkills],
    );

    for (let index = 0; index < workers.length; index += 1) {
      const worker = workers[index];

      this.realtimeGateway.emitToUser(worker.id, 'request.new', {
        requestId,
        category: request.category,
        title: request.title,
        budget: Number(request.budget ?? baseBudget),
        distanceKm: Number(worker.distance_km ?? 0),
        address: request.address,
        description: request.description,
        aiCategories: request.aiCategories ?? [],
      });
    }

    const workerIds = workers.map((worker) => worker.id).filter(Boolean);
    if (workerIds.length > 0) {
      const tokenRows = await this.dataSource.query<any[]>(
        `
        SELECT token
        FROM push_tokens
        WHERE user_id = ANY($1::uuid[])
        `,
        [workerIds],
      );

      const tokens = tokenRows
        .map((row) => String(row.token ?? ''))
        .filter(Boolean);
      if (tokens.length > 0) {
        await this.notificationsService.notifyWorkersForJobWave({
          tokens,
          jobId: requestId,
          category: request.category,
          offeredPrice: `Bs ${Math.round(baseBudget)}`,
          distanceKm: 'cerca de ti',
        });
      }
    }

    return workers.length;
  }

  private async expireStaleOffers(requestId?: string) {
    const rows = await this.dataSource.query<any[]>(
      `
      UPDATE job_offers jo
      SET status = 'expired'
      FROM job_requests jr
      WHERE jo.request_id = jr.id
        AND jo.status = 'pending'
        AND jo.expires_at IS NOT NULL
        AND jo.expires_at < NOW()
        AND ($1::uuid IS NULL OR jo.request_id = $1::uuid)
      RETURNING jo.id, jo.request_id, jo.worker_user_id, jr.client_user_id
      `,
      [requestId ?? null],
    );

    for (const row of rows) {
      const payload = {
        offerId: row.id,
        requestId: row.request_id,
        workerUserId: row.worker_user_id,
        clientUserId: row.client_user_id,
        status: 'expired',
      };
      this.realtimeGateway.emitToUser(
        row.worker_user_id,
        'offer.expired',
        payload,
      );
      this.realtimeGateway.emitToUser(
        row.client_user_id,
        'offer.expired',
        payload,
      );
    }
  }

  private async ensureCategoriesExist(values: string[]) {
    const sanitized = [
      ...new Set(values.map((item) => item.trim()).filter(Boolean)),
    ].slice(0, 30);
    for (const name of sanitized) {
      const id = this.toCategoryId(name);
      await this.dataSource.query(
        `
        INSERT INTO categories (id, name, description, is_active)
        VALUES ($1, $2, $3, true)
        ON CONFLICT DO NOTHING
        `,
        [id, name, `Categoria generada automaticamente: ${name}`],
      );
      await this.dataSource.query(
        `
        UPDATE categories
        SET is_active = true,
            updated_at = NOW()
        WHERE id = $1 OR LOWER(name) = LOWER($2)
        `,
        [id, name],
      );
    }
  }
}
