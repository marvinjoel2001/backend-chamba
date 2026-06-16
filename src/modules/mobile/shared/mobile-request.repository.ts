import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RealtimeGateway } from '../../realtime/realtime.gateway';

@Injectable()
export class MobileRequestRepository {
  private static readonly OFFER_LIFETIME_SECONDS = 120;
  private static readonly OFFER_LIFETIME_CONFIG_KEY = 'offer_lifetime_by_price_type';
  private static readonly WORKER_NOTIFICATION_RADIUS_CONFIG_KEY = 'worker_notification_radius_km';

  constructor(
    private readonly dataSource: DataSource,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  public toCategoryId(value: string) {
    return (
      value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'trabajo_general'
    );
  }

  public parseAiCategories(
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
      .filter((item) => Boolean(item.id) && Boolean(item.name));
  }

  public async getRequestById(requestId: string) {
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
             created_at,
             modality,
             estimated_hours,
             hourly_rate,
             days,
             daily_rate,
             start_date
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
      modality: row.modality,
      estimatedHours: row.estimated_hours == null ? null : Number(row.estimated_hours),
      hourlyRate: row.hourly_rate == null ? null : Number(row.hourly_rate),
      days: row.days == null ? null : Number(row.days),
      dailyRate: row.daily_rate == null ? null : Number(row.daily_rate),
      startDate: row.start_date,
    };
  }

  public async getUserById(userId: string) {
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
             verification_status,
             id_photo_url,
             face_photo_url,
             id_photo_verified,
             face_photo_verified,
             verification_reviewed_at,
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
      verificationStatus: row.verification_status ?? 'not_verified',
      idPhotoUrl: row.id_photo_url ?? null,
      facePhotoUrl: row.face_photo_url ?? null,
      idPhotoVerified: row.id_photo_verified ?? null,
      facePhotoVerified: row.face_photo_verified ?? null,
      verificationReviewedAt: row.verification_reviewed_at ?? null,
      isAvailable: row.is_available,
      workRadiusKm: Number(row.work_radius_km ?? 0),
      currentLatitude:
        row.current_latitude == null ? null : Number(row.current_latitude),
      currentLongitude:
        row.current_longitude == null ? null : Number(row.current_longitude),
    };
  }

  public async getUserByIdWithPhotoMeta(userId: string) {
    return this.getUserById(userId);
  }

  public async findLatestClientRequest(clientUserId: string) {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT jr.id,
             jr.client_user_id,
             jr.title,
             jr.description,
             jr.category,
             jr.ai_categories,
             jr.budget,
             jr.price_type,
             jr.address,
             jr.status,
             jr.created_at,
             jr.modality,
             jr.estimated_hours,
             jr.hourly_rate,
             jr.days,
             jr.daily_rate,
             jr.start_date,
             (SELECT COUNT(*) FROM job_offers jo WHERE jo.request_id = jr.id AND jo.status = 'pending') AS pending_offers_count
      FROM job_requests jr
      WHERE jr.client_user_id = $1
      ORDER BY jr.created_at DESC
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
      modality: row.modality,
      estimatedHours: row.estimated_hours == null ? null : Number(row.estimated_hours),
      hourlyRate: row.hourly_rate == null ? null : Number(row.hourly_rate),
      days: row.days == null ? null : Number(row.days),
      dailyRate: row.daily_rate == null ? null : Number(row.daily_rate),
      startDate: row.start_date,
      pendingOffersCount: Number(row.pending_offers_count ?? 0),
    };
  }

  public async resolveRequest(params: {
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

  public async getRequestPhotos(requestId: string) {
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

  public async expireStaleOffers(requestId?: string) {
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

  public async getWorkerNotificationRadiusKm(): Promise<number> {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT value_json
      FROM app_config
      WHERE key = $1
      LIMIT 1
      `,
      [MobileRequestRepository.WORKER_NOTIFICATION_RADIUS_CONFIG_KEY],
    );

    const config = rows[0]?.value_json;
    const candidate = Number(config?.radiusKm);
    if (!Number.isFinite(candidate) || candidate <= 0) {
      return 5;
    }
    return Math.min(50, Math.max(0.5, candidate));
  }

  public async getOfferLifetimeConfig(): Promise<Record<string, any> | null> {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT value_json
      FROM app_config
      WHERE key = $1
      LIMIT 1
      `,
      [MobileRequestRepository.OFFER_LIFETIME_CONFIG_KEY],
    );

    const config = rows[0]?.value_json;
    return config && typeof config === 'object' ? config : null;
  }

  public normalizePriceTypeKey(
    priceType?: string | null,
  ): 'fixed' | 'hour' | 'day' {
    const normalized = String(priceType ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim();

    if (normalized.includes('hora') || normalized.includes('hour')) {
      return 'hour';
    }
    if (normalized.includes('dia') || normalized.includes('day')) {
      return 'day';
    }
    return 'fixed';
  }

  public resolveOfferLifetimeSeconds(
    config: Record<string, any> | null,
    priceType?: string | null,
  ): number {
    const fallback = MobileRequestRepository.OFFER_LIFETIME_SECONDS;
    if (!config) {
      return fallback;
    }

    const key = this.normalizePriceTypeKey(priceType);
    const candidate =
      key === 'hour'
        ? config.hour
        : key === 'day'
          ? config.day
          : config.fixed;
    const parsed = Number(candidate);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }

  public async getOfferLifetimeSeconds(
    priceType?: string | null,
  ): Promise<number> {
    const config = await this.getOfferLifetimeConfig();
    return this.resolveOfferLifetimeSeconds(config, priceType);
  }

  public async ensureThreadExists(threadId: string) {
    const rows = await this.dataSource.query<any[]>(
      `SELECT id FROM chat_threads WHERE id = $1 LIMIT 1`,
      [threadId],
    );

    if (!rows[0]) {
      throw new NotFoundException('Thread not found');
    }
  }

  public async ensureThreadAndInitialMessage(params: {
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

  public async ensureCategoriesExist(values: string[]) {
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
