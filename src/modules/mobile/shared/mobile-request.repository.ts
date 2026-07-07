import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RealtimeGateway } from '../../realtime/realtime.gateway';

@Injectable()
export class MobileRequestRepository {
  // Vida de la oferta por modalidad (segundos): por hora es urgente,
  // fijo es intermedio y por dia (trabajos planificados) da mas margen.
  private static readonly DEFAULT_OFFER_LIFETIME_BY_PRICE_TYPE: Record<
    'fixed' | 'hour' | 'day',
    number
  > = {
    fixed: 300,
    hour: 120,
    day: 900,
  };
  private static readonly OFFER_LIFETIME_CONFIG_KEY =
    'offer_lifetime_by_price_type';
  private static readonly REQUEST_TIMEOUT_CONFIG_KEY =
    'request_timeout_by_price_type';
  // Timeouts de auto-cancelacion y recordatorios (minutos) por modalidad.
  private static readonly DEFAULT_REQUEST_TIMEOUT_BY_PRICE_TYPE: Record<
    'fixed' | 'hour' | 'day',
    { timeoutMinutes: number; reminder1Minutes: number; reminder2Minutes: number }
  > = {
    fixed: { timeoutMinutes: 120, reminder1Minutes: 30, reminder2Minutes: 60 },
    hour: { timeoutMinutes: 30, reminder1Minutes: 10, reminder2Minutes: 20 },
    day: {
      timeoutMinutes: 12 * 60,
      reminder1Minutes: 2 * 60,
      reminder2Minutes: 6 * 60,
    },
  };
  private static readonly WORKER_NOTIFICATION_RADIUS_CONFIG_KEY =
    'worker_notification_radius_km';

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
      estimatedHours:
        row.estimated_hours == null ? null : Number(row.estimated_hours),
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
             is_agency_worker,
             agency_id,
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
      isAgencyWorker: row.is_agency_worker ?? false,
      agencyId: row.agency_id ?? null,
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
      estimatedHours:
        row.estimated_hours == null ? null : Number(row.estimated_hours),
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
    const key = this.normalizePriceTypeKey(priceType);
    const fallback =
      MobileRequestRepository.DEFAULT_OFFER_LIFETIME_BY_PRICE_TYPE[key];
    if (!config) {
      return fallback;
    }

    const candidate =
      key === 'hour' ? config.hour : key === 'day' ? config.day : config.fixed;
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

  public getDefaultOfferLifetimeByPriceType() {
    return { ...MobileRequestRepository.DEFAULT_OFFER_LIFETIME_BY_PRICE_TYPE };
  }

  public getDefaultRequestTimeoutByPriceType() {
    return JSON.parse(
      JSON.stringify(
        MobileRequestRepository.DEFAULT_REQUEST_TIMEOUT_BY_PRICE_TYPE,
      ),
    ) as Record<
      'fixed' | 'hour' | 'day',
      {
        timeoutMinutes: number;
        reminder1Minutes: number;
        reminder2Minutes: number;
      }
    >;
  }

  public async getRequestTimeoutConfig(): Promise<
    Record<
      'fixed' | 'hour' | 'day',
      {
        timeoutMinutes: number;
        reminder1Minutes: number;
        reminder2Minutes: number;
      }
    >
  > {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT value_json
      FROM app_config
      WHERE key = $1
      LIMIT 1
      `,
      [MobileRequestRepository.REQUEST_TIMEOUT_CONFIG_KEY],
    );

    const defaults = this.getDefaultRequestTimeoutByPriceType();
    const config = rows[0]?.value_json;
    if (!config || typeof config !== 'object') {
      return defaults;
    }

    for (const key of ['fixed', 'hour', 'day'] as const) {
      const entry = config[key];
      if (!entry || typeof entry !== 'object') continue;
      for (const field of [
        'timeoutMinutes',
        'reminder1Minutes',
        'reminder2Minutes',
      ] as const) {
        const parsed = Number(entry[field]);
        if (Number.isFinite(parsed) && parsed > 0) {
          defaults[key][field] = Math.floor(parsed);
        }
      }
    }
    return defaults;
  }

  public async saveRequestTimeoutConfig(
    config: Record<string, any>,
  ): Promise<void> {
    await this.dataSource.query(
      `
      INSERT INTO app_config (key, value_json, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()
      `,
      [
        MobileRequestRepository.REQUEST_TIMEOUT_CONFIG_KEY,
        JSON.stringify(config),
      ],
    );
  }

  public async saveOfferLifetimeConfig(
    config: Record<string, any>,
  ): Promise<void> {
    await this.dataSource.query(
      `
      INSERT INTO app_config (key, value_json, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()
      `,
      [
        MobileRequestRepository.OFFER_LIFETIME_CONFIG_KEY,
        JSON.stringify(config),
      ],
    );
  }

  /**
   * Cierra (expira) todas las ofertas pendientes de una solicitud y avisa por
   * realtime. Devuelve los workers afectados para que el llamador pueda
   * enviarles push. Se usa al cancelar una solicitud (manual o por timeout).
   */
  public async closePendingOffers(requestId: string): Promise<
    Array<{
      offerId: string;
      workerUserId: string;
      clientUserId: string;
    }>
  > {
    const rows = await this.dataSource.query<any[]>(
      `
      UPDATE job_offers jo
      SET status = 'expired', expires_at = NOW()
      FROM job_requests jr
      WHERE jo.request_id = jr.id
        AND jo.request_id = $1
        AND jo.status = 'pending'
      RETURNING jo.id, jo.worker_user_id, jr.client_user_id
      `,
      [requestId],
    );

    return rows.map((row) => {
      const payload = {
        offerId: row.id,
        requestId,
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
      return {
        offerId: row.id,
        workerUserId: row.worker_user_id,
        clientUserId: row.client_user_id,
      };
    });
  }

  public async getLatestPushToken(userId: string): Promise<string | null> {
    const rows = await this.dataSource.query<any[]>(
      `SELECT token FROM push_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1`,
      [userId],
    );
    return rows[0]?.token ?? null;
  }

  /**
   * Fecha/hora efectiva de inicio de un trabajo. Combina scheduled_at
   * (timestamp) con start_date (texto 'YYYY-MM-DD' o 'YYYY-MM-DDTHH:mm').
   * Las fechas sin hora se interpretan a las 09:00 de Bolivia (UTC-4).
   */
  public resolveStartAt(
    scheduledAt?: Date | string | null,
    startDate?: string | null,
  ): Date | null {
    if (scheduledAt) {
      const parsed = new Date(scheduledAt);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    const raw = String(startDate ?? '').trim();
    if (!raw) return null;

    // Bolivia no tiene horario de verano: offset fijo -04:00.
    const withTime = raw.includes('T') ? raw : `${raw}T09:00:00`;
    const iso = /[+-]\d{2}:?\d{2}$|Z$/.test(withTime)
      ? withTime
      : `${withTime}-04:00`;
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
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
