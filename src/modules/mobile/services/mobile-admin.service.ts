import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../../notifications/notifications.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { MobileRequestRepository } from '../shared/mobile-request.repository';

@Injectable()
export class MobileAdminService {
  private readonly logger = new Logger(MobileAdminService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly repo: MobileRequestRepository,
  ) {}

  public async broadcastNotification(payload: {
    target: 'all' | 'workers' | 'clients' | 'custom';
    type: 'push' | 'toast';
    title: string;
    body: string;
    toastType?: 'info' | 'success' | 'error';
    userIds?: string[];
    isCallAlert?: boolean;
  }) {
    if (payload.type === 'toast') {
      this.realtimeGateway.server.emit('notification.toast', {
        target: payload.target,
        title: payload.title,
        body: payload.body,
        toastType: payload.toastType ?? 'info',
        userIds: payload.userIds,
      });
      return { success: true, method: 'socket' };
    } else {
      let query = `
        SELECT pt.token
        FROM push_tokens pt
        JOIN users u ON u.id = pt.user_id
        WHERE pt.token IS NOT NULL
      `;
      const args: any[] = [];
      if (payload.target === 'workers') {
        query += ` AND u.type = $1`;
        args.push('worker');
      } else if (payload.target === 'clients') {
        query += ` AND u.type = $1`;
        args.push('client');
      } else if (
        payload.target === 'custom' &&
        payload.userIds &&
        payload.userIds.length > 0
      ) {
        query += ` AND u.id = ANY($1::uuid[])`;
        args.push(payload.userIds);
      } else if (payload.target === 'custom') {
        return { success: true, method: 'push', count: 0 };
      }

      const rows = await this.dataSource.query<any[]>(query, args);
      const tokens = rows.map((r) => r.token);

      const count = await this.notificationsService.broadcastPush({
        tokens,
        title: payload.title,
        body: payload.body,
        isCallAlert: payload.isCallAlert,
      });

      return { success: true, method: 'push', count };
    }
  }

  public async getPushUsers() {
    const query = `
      SELECT DISTINCT ON (u.id)
        u.id,
        u.first_name as "firstName",
        u.last_name as "lastName",
        u.type,
        pt.last_seen_at as "lastSeenAt"
      FROM push_tokens pt
      JOIN users u ON u.id = pt.user_id
      WHERE pt.token IS NOT NULL
      ORDER BY u.id, pt.last_seen_at DESC
    `;
    const rows = await this.dataSource.query<any[]>(query);
    rows.sort((a, b) => {
      const dateA = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
      const dateB = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
      return dateB - dateA;
    });
    return rows.slice(0, 500);
  }

  public async getAdminMapSnapshot(params: { since?: string }) {
    const sinceIso =
      params.since && !Number.isNaN(Date.parse(params.since))
        ? new Date(params.since).toISOString()
        : null;

    const workers = await this.dataSource.query<any[]>(
      `
      SELECT u.id,
             u.first_name,
             u.last_name,
             u.is_available,
             u.average_rating,
             u.completed_jobs,
             u.updated_at,
             ST_Y(u.current_location::geometry) AS latitude,
             ST_X(u.current_location::geometry) AS longitude,
             jr.id AS active_request_id,
             jr.title AS active_request_title,
             jr.status AS active_request_status,
             jr.address AS active_request_address,
             jr.worker_arrived AS active_worker_arrived,
             c.first_name AS active_client_first_name,
             c.last_name AS active_client_last_name
      FROM users u
      LEFT JOIN job_offers jo ON jo.worker_user_id = u.id AND jo.status = 'accepted'
      LEFT JOIN job_requests jr ON jr.id = jo.request_id AND jr.status IN ('assigned', 'in_progress')
      LEFT JOIN users c ON c.id = jr.client_user_id
      WHERE u.type = 'worker'
        AND u.current_location IS NOT NULL
        AND ($1::timestamptz IS NULL OR u.updated_at >= $1::timestamptz)
      ORDER BY u.updated_at DESC
      LIMIT 10000
      `,
      [sinceIso],
    );

    const clients = await this.dataSource.query<any[]>(
      `
      SELECT u.id,
             u.first_name,
             u.last_name,
             u.updated_at,
             ST_Y(u.current_location::geometry) AS latitude,
             ST_X(u.current_location::geometry) AS longitude
      FROM users u
      WHERE u.type = 'client'
        AND u.current_location IS NOT NULL
        AND ($1::timestamptz IS NULL OR u.updated_at >= $1::timestamptz)
      ORDER BY u.updated_at DESC
      LIMIT 5000
      `,
      [sinceIso],
    );

    const requests = await this.dataSource.query<any[]>(
      `
      SELECT jr.id,
             jr.title,
             jr.status,
             jr.budget,
             jr.address,
             jr.updated_at,
             jr.created_at,
             u.first_name AS client_first_name,
             u.last_name AS client_last_name,
             cb.first_name AS canceler_first_name,
             cb.last_name AS canceler_last_name,
             ST_Y(jr.location::geometry) AS latitude,
             ST_X(jr.location::geometry) AS longitude,
             (
               SELECT p.url
               FROM job_request_photos p
               WHERE p.request_id = jr.id
               ORDER BY p.created_at ASC
               LIMIT 1
             ) AS photo_url
      FROM job_requests jr
      JOIN users u ON u.id = jr.client_user_id
      LEFT JOIN users cb ON cb.id = jr.cancelled_by
      WHERE jr.location IS NOT NULL
        AND ($1::timestamptz IS NULL OR jr.updated_at >= $1::timestamptz)
      ORDER BY jr.updated_at DESC
      LIMIT 5000
      `,
      [sinceIso],
    );

    return {
      serverTime: new Date().toISOString(),
      workers: workers.map((row) => ({
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name ?? '',
        isAvailable: row.is_available,
        averageRating: Number(row.average_rating ?? 0),
        completedJobs: Number(row.completed_jobs ?? 0),
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        updatedAt: row.updated_at,
        activeRequest: row.active_request_id
          ? {
              id: row.active_request_id,
              title: row.active_request_title,
              status: row.active_request_status,
              address: row.active_request_address,
              workerArrived: row.active_worker_arrived ?? false,
              clientName: [
                row.active_client_first_name,
                row.active_client_last_name,
              ]
                .filter(Boolean)
                .join(' '),
            }
          : null,
      })),
      clients: clients.map((row) => ({
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name ?? '',
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        updatedAt: row.updated_at,
      })),
      requests: requests.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        budget: Number(row.budget ?? 0),
        address: row.address,
        clientName:
          `${row.client_first_name ?? ''} ${row.client_last_name ?? ''}`.trim(),
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        updatedAt: row.updated_at,
        createdAt: row.created_at,
        photoUrl: row.photo_url ?? null,
        cancelledBy: row.canceler_first_name
          ? `${row.canceler_first_name} ${row.canceler_last_name ?? ''}`.trim()
          : null,
      })),
    };
  }

  public async getAdminWallet(params: { period?: 'day' | 'week' | 'month' }) {
    const period = params.period ?? 'week';
    const interval =
      period === 'day'
        ? `NOW() - INTERVAL '1 day'`
        : period === 'month'
          ? `NOW() - INTERVAL '1 month'`
          : `NOW() - INTERVAL '7 days'`;

    const rows = await this.dataSource.query<any[]>(
      `
      SELECT u.id,
             u.first_name,
             u.last_name,
             COUNT(*)::int AS jobs_completed,
             COALESCE(SUM(jo.amount), 0)::numeric AS earnings
      FROM job_offers jo
      JOIN users u ON u.id = jo.worker_user_id
      JOIN job_requests jr ON jr.id = jo.request_id
      WHERE jo.status = 'accepted'
        AND jr.created_at >= ${interval}
      GROUP BY u.id, u.first_name, u.last_name
      ORDER BY earnings DESC
      LIMIT 500
      `,
    );

    const totals = rows.reduce(
      (acc, row) => {
        acc.totalEarnings += Number(row.earnings ?? 0);
        acc.totalJobs += Number(row.jobs_completed ?? 0);
        return acc;
      },
      { totalEarnings: 0, totalJobs: 0 },
    );

    return {
      period,
      totals,
      workers: rows.map((row) => ({
        id: row.id,
        name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
        jobsCompleted: Number(row.jobs_completed ?? 0),
        earnings: Number(row.earnings ?? 0),
      })),
    };
  }

  public async getAdminWorkerNotificationSettings() {
    const radiusKm = await this.repo.getWorkerNotificationRadiusKm();
    return {
      radiusKm,
    };
  }

  public async updateAdminWorkerNotificationSettings(params: {
    radiusKm: number;
  }) {
    const parsed = Number(params.radiusKm);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException('radiusKm must be greater than 0');
    }

    const radiusKm = Math.min(50, Math.max(0.5, parsed));
    await this.dataSource.query(
      `
      INSERT INTO app_config (key, value_json, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()
      `,
      ['worker_notification_radius_km', JSON.stringify({ radiusKm })],
    );

    return { radiusKm };
  }

  public async getOfferLifetimeSettings() {
    const config = await this.repo.getOfferLifetimeConfig();
    const defaults = this.repo.getDefaultOfferLifetimeByPriceType();
    return {
      fixed: this.repo.resolveOfferLifetimeSeconds(config, 'fixed'),
      hour: this.repo.resolveOfferLifetimeSeconds(config, 'hour'),
      day: this.repo.resolveOfferLifetimeSeconds(config, 'day'),
      defaults,
    };
  }

  public async updateOfferLifetimeSettings(params: {
    fixed: number;
    hour: number;
    day: number;
  }) {
    const sanitized: Record<string, number> = {};
    for (const key of ['fixed', 'hour', 'day'] as const) {
      const parsed = Number(params[key]);
      if (!Number.isFinite(parsed) || parsed < 30 || parsed > 24 * 3600) {
        throw new BadRequestException(
          `${key} debe estar entre 30 y 86400 segundos`,
        );
      }
      sanitized[key] = Math.floor(parsed);
    }

    await this.repo.saveOfferLifetimeConfig(sanitized);
    return sanitized;
  }

  public async getRequestTimeoutSettings() {
    return this.repo.getRequestTimeoutConfig();
  }

  public async updateRequestTimeoutSettings(
    params: Record<
      string,
      {
        timeoutMinutes?: number;
        reminder1Minutes?: number;
        reminder2Minutes?: number;
      }
    >,
  ) {
    const current = await this.repo.getRequestTimeoutConfig();
    for (const key of ['fixed', 'hour', 'day'] as const) {
      const entry = params?.[key];
      if (!entry || typeof entry !== 'object') continue;
      for (const field of [
        'timeoutMinutes',
        'reminder1Minutes',
        'reminder2Minutes',
      ] as const) {
        if (entry[field] == null) continue;
        const parsed = Number(entry[field]);
        if (!Number.isFinite(parsed) || parsed < 1 || parsed > 7 * 24 * 60) {
          throw new BadRequestException(
            `${key}.${field} debe estar entre 1 y 10080 minutos`,
          );
        }
        current[key][field] = Math.floor(parsed);
      }
      if (current[key].timeoutMinutes <= current[key].reminder1Minutes) {
        throw new BadRequestException(
          `${key}: timeoutMinutes debe ser mayor a reminder1Minutes`,
        );
      }
    }

    await this.repo.saveRequestTimeoutConfig(current);
    return current;
  }

  public async getRequestNotifiedWorkers(requestId: string) {
    if (!requestId) {
      throw new BadRequestException('requestId is required');
    }

    const rows = await this.dataSource.query<any[]>(
      `
      SELECT n.user_id,
             n.created_at AS notified_at,
             u.first_name,
             u.last_name,
             u.profile_photo_url,
             u.phone,
             u.average_rating,
             u.completed_jobs,
             jo.status AS offer_status,
             jo.amount AS offer_amount
      FROM notifications n
      JOIN users u ON u.id = n.user_id
      LEFT JOIN job_offers jo
        ON jo.request_id = $1::uuid AND jo.worker_user_id = n.user_id
      WHERE n.type = 'request_new'
        AND n.data->>'jobId' = $1::text
      ORDER BY n.created_at ASC
      `,
      [requestId],
    );

    return {
      requestId,
      total: rows.length,
      workers: rows.map((row) => ({
        id: row.user_id,
        firstName: row.first_name,
        lastName: row.last_name ?? '',
        profilePhotoUrl: row.profile_photo_url ?? null,
        phone: row.phone ?? null,
        averageRating: Number(row.average_rating ?? 0),
        completedJobs: Number(row.completed_jobs ?? 0),
        notifiedAt: row.notified_at,
        offerStatus: row.offer_status ?? null,
        offerAmount: row.offer_amount != null ? Number(row.offer_amount) : null,
      })),
    };
  }

  public async getCancellationStats() {
    const rows = await this.dataSource.query<any[]>(`
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.type,
        COUNT(*)::int AS cancel_count
      FROM job_requests jr
      LEFT JOIN job_offers jo ON jo.request_id = jr.id AND jo.status = 'accepted'
      JOIN users u ON u.id = COALESCE(jo.worker_user_id, jr.client_user_id)
      WHERE jr.status = 'cancelled'
      GROUP BY u.id, u.first_name, u.last_name, u.type
      HAVING COUNT(*) >= 1
      ORDER BY cancel_count DESC
      LIMIT 100
    `);

    return {
      users: rows.map((r) => ({
        id: r.id,
        name: [r.first_name, r.last_name].filter(Boolean).join(' '),
        type: r.type,
        cancelCount: r.cancel_count,
      })),
    };
  }

  public async getCommissionConfig() {
    const rows = await this.dataSource.query<any[]>(
      `SELECT value_json FROM app_config WHERE key = 'platform_commission' LIMIT 1`,
    );
    if (rows[0]) {
      const val =
        typeof rows[0].value_json === 'string'
          ? JSON.parse(rows[0].value_json)
          : rows[0].value_json;
      return { commissionPercent: Number(val.percent ?? 10) };
    }
    return { commissionPercent: 10 };
  }

  public async updateCommissionConfig(params: { commissionPercent: number }) {
    const percent = Math.min(50, Math.max(0, Number(params.commissionPercent)));
    if (!Number.isFinite(percent)) {
      throw new BadRequestException('commissionPercent must be a valid number');
    }

    await this.dataSource.query(
      `
      INSERT INTO app_config (key, value_json, updated_at)
      VALUES ('platform_commission', $1::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()
      `,
      [JSON.stringify({ percent })],
    );

    return { commissionPercent: percent };
  }

  public async getAiConfig() {
    const rows = await this.dataSource.query<any[]>(
      `SELECT value_json FROM app_config WHERE key = 'ai_config' LIMIT 1`,
    );
    const defaultVal = {
      activeProvider: 'nvidia',
      geminiKey: '',
      nvidiaKey: '',
      nvidiaModel: 'meta/llama-3.1-8b-instruct',
      deepseekKey: '',
    };
    if (rows[0]) {
      const val =
        typeof rows[0].value_json === 'string'
          ? JSON.parse(rows[0].value_json)
          : rows[0].value_json;
      return { ...defaultVal, ...val };
    }
    return defaultVal;
  }

  public async testAiMessage(message: string): Promise<{
    ok: boolean;
    response?: string;
    model?: string;
    provider?: string;
    durationMs?: number;
    error?: string;
  }> {
    const config = await this.getAiConfig();
    const { activeProvider } = config;

    let endpointUrl = '';
    let apiKey = '';
    let modelName = '';

    if (activeProvider === 'nvidia' && config.nvidiaKey) {
      endpointUrl = 'https://integrate.api.nvidia.com/v1/chat/completions';
      apiKey = config.nvidiaKey;
      modelName = config.nvidiaModel || 'meta/llama-3.1-8b-instruct';
    } else if (activeProvider === 'gemini' && config.geminiKey) {
      endpointUrl =
        'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
      apiKey = config.geminiKey;
      modelName = 'gemini-2.0-flash';
    } else if (activeProvider === 'deepseek' && config.deepseekKey) {
      endpointUrl = 'https://api.deepseek.com/v1/chat/completions';
      apiKey = config.deepseekKey;
      modelName = 'deepseek-chat';
    } else {
      return {
        ok: false,
        error: `API key no configurada para ${activeProvider}`,
      };
    }

    const isReasoningModel = modelName.includes('minimax');
    const body: any = {
      model: modelName,
      messages: [{ role: 'user', content: message }],
      temperature: isReasoningModel ? 1.0 : 0.7,
      max_tokens: isReasoningModel ? 800 : 300,
      stream: false,
    };
    if (isReasoningModel) body.top_p = 0.95;

    const start = Date.now();
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 40000);
      const res = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(t);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        let friendlyError = `Error ${res.status} del proveedor de IA`;
        if (res.status === 401) friendlyError = 'API key inválida o expirada';
        else if (res.status === 404)
          friendlyError =
            'Modelo no encontrado. Verifica el nombre del modelo.';
        else if (res.status === 429)
          friendlyError = 'Límite de requests alcanzado. Intenta más tarde.';
        else if (res.status >= 500)
          friendlyError = `Error interno del proveedor (${res.status}). Intenta más tarde.`;
        else if (errText) friendlyError = errText.slice(0, 120);
        return { ok: false, error: friendlyError };
      }

      const payload = await res.json();
      const response = payload.choices?.[0]?.message?.content?.trim() ?? '';
      return {
        ok: true,
        response,
        model: modelName,
        provider: activeProvider,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return { ok: false, error: (err as Error)?.message ?? String(err) };
    }
  }

  public async checkAiStatus(): Promise<{
    nvidia: {
      ok: boolean;
      model?: string;
      durationMs?: number;
      error?: string;
    };
    gemini: { ok: boolean; durationMs?: number; error?: string };
    deepseek: { ok: boolean; durationMs?: number; error?: string };
  }> {
    const config = await this.getAiConfig();
    const probe = 'Responde exactamente con: OK';

    const testProvider = async (
      endpointUrl: string,
      apiKey: string,
      modelName: string,
    ) => {
      if (!apiKey) return { ok: false, error: 'Sin API key' };
      const isReasoning = modelName.includes('minimax');
      const body: any = {
        model: modelName,
        messages: [{ role: 'user', content: probe }],
        temperature: isReasoning ? 1.0 : 0.1,
        max_tokens: isReasoning ? 600 : 30,
        stream: false,
      };
      if (isReasoning) body.top_p = 0.95;
      const start = Date.now();
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 40000);
        const res = await fetch(endpointUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(t);
        if (!res.ok) {
          let msg = `Error ${res.status}`;
          if (res.status === 401) msg = 'API key inválida';
          else if (res.status === 404) msg = 'Modelo no encontrado';
          else if (res.status === 429) msg = 'Límite de requests';
          else if (res.status >= 500) msg = 'Error del proveedor';
          return { ok: false, error: msg };
        }
        const p = await res.json();
        const text = p.choices?.[0]?.message?.content?.trim() ?? '';
        return { ok: !!text, model: modelName, durationMs: Date.now() - start };
      } catch (err) {
        return { ok: false, error: (err as Error)?.message ?? String(err) };
      }
    };

    const [nvidia, gemini, deepseek] = await Promise.all([
      testProvider(
        'https://integrate.api.nvidia.com/v1/chat/completions',
        config.nvidiaKey,
        config.nvidiaModel || 'meta/llama-3.1-8b-instruct',
      ),
      testProvider(
        'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        config.geminiKey,
        'gemini-2.0-flash',
      ),
      testProvider(
        'https://api.deepseek.com/v1/chat/completions',
        config.deepseekKey,
        'deepseek-chat',
      ),
    ]);

    return { nvidia, gemini, deepseek };
  }

  public async updateAiConfig(params: {
    activeProvider: string;
    geminiKey: string;
    nvidiaKey: string;
    nvidiaModel: string;
    deepseekKey: string;
  }) {
    const value = {
      activeProvider: params.activeProvider || 'nvidia',
      geminiKey: params.geminiKey || '',
      nvidiaKey: params.nvidiaKey || '',
      nvidiaModel: params.nvidiaModel || 'meta/llama-3.1-8b-instruct',
      deepseekKey: params.deepseekKey || '',
    };

    await this.dataSource.query(
      `
      INSERT INTO app_config (key, value_json, updated_at)
      VALUES ('ai_config', $1::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()
      `,
      [JSON.stringify(value)],
    );

    return value;
  }

  // ── Stripe config (switch centralizado de pagos con tarjeta) ────

  public async getStripeConfig() {
    const rows = await this.dataSource.query<any[]>(
      `SELECT value_json FROM app_config WHERE key = 'stripe_config' LIMIT 1`,
    );
    const val = rows[0]
      ? typeof rows[0].value_json === 'string'
        ? JSON.parse(rows[0].value_json)
        : rows[0].value_json
      : {};

    const secretKey: string = val?.secretKey ?? '';
    // Nunca devolver la secret key completa: solo si está configurada y sus
    // últimos 4 caracteres para que el admin la identifique.
    return {
      active: val?.active === true,
      publishableKey: val?.publishableKey ?? '',
      currency: val?.currency ?? 'usd',
      secretKeySet: secretKey.length > 0,
      secretKeyLast4: secretKey.length > 4 ? secretKey.slice(-4) : '',
    };
  }

  public async updateStripeConfig(params: {
    active: boolean;
    publishableKey: string;
    secretKey: string;
    currency?: string;
  }) {
    const rows = await this.dataSource.query<any[]>(
      `SELECT value_json FROM app_config WHERE key = 'stripe_config' LIMIT 1`,
    );
    const previous = rows[0]
      ? typeof rows[0].value_json === 'string'
        ? JSON.parse(rows[0].value_json)
        : rows[0].value_json
      : {};

    const value = {
      active: params.active === true,
      publishableKey: params.publishableKey || previous?.publishableKey || '',
      // Si no envían secretKey se conserva la anterior (permite togglear
      // active sin re-pegar la llave).
      secretKey: params.secretKey || previous?.secretKey || '',
      currency: (params.currency || previous?.currency || 'usd').toLowerCase(),
    };

    await this.dataSource.query(
      `
      INSERT INTO app_config (key, value_json, updated_at)
      VALUES ('stripe_config', $1::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()
      `,
      [JSON.stringify(value)],
    );

    return this.getStripeConfig();
  }

  public async adminCancelJob(params: { requestId: string }) {
    const rows = await this.dataSource.query<any[]>(
      `SELECT id, title, client_user_id, status FROM job_requests WHERE id = $1 LIMIT 1`,
      [params.requestId],
    );
    if (!rows[0]) throw new NotFoundException('Request not found');

    const req = rows[0];
    if (req.status === 'completed' || req.status === 'cancelled') {
      throw new BadRequestException(
        'Cannot cancel a request that is already ' + req.status,
      );
    }

    await this.dataSource.query(
      `UPDATE job_requests SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [params.requestId],
    );

    const closedOffers = await this.repo.closePendingOffers(params.requestId);
    for (const closed of closedOffers) {
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

    const offerRows = await this.dataSource.query<any[]>(
      `SELECT worker_user_id FROM job_offers WHERE request_id = $1 AND status = 'accepted' LIMIT 1`,
      [params.requestId],
    );
    if (offerRows[0]?.worker_user_id) {
      await this.dataSource.query(
        `UPDATE users SET is_available = true, updated_at = NOW() WHERE id = $1`,
        [offerRows[0].worker_user_id],
      );
    }

    this.realtimeGateway.server.emit('request.status.updated', {
      requestId: params.requestId,
      status: 'cancelled',
      timestamp: new Date().toISOString(),
    });

    if (req.client_user_id) {
      const clientTokenRows = await this.dataSource.query<any[]>(
        `SELECT token AS push_token FROM push_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1`,
        [req.client_user_id],
      );
      await this.notificationsService
        .notifyJobCancelled({
          userId: req.client_user_id,
          token: clientTokenRows[0]?.push_token || null,
          cancelerName: 'Soporte',
          jobTitle: req.title,
          requestId: params.requestId,
        })
        .catch((e) => this.logger.error('Failed to notify client cancel', e));
    }

    if (offerRows[0]?.worker_user_id) {
      const workerTokenRows = await this.dataSource.query<any[]>(
        `SELECT token AS push_token FROM push_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1`,
        [offerRows[0].worker_user_id],
      );
      await this.notificationsService
        .notifyJobCancelled({
          userId: offerRows[0].worker_user_id,
          token: workerTokenRows[0]?.push_token || null,
          cancelerName: 'Soporte',
          jobTitle: req.title,
          requestId: params.requestId,
        })
        .catch((e) => this.logger.error('Failed to notify worker cancel', e));
    }

    return { requestId: params.requestId, status: 'cancelled' };
  }
}
