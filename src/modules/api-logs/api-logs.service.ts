import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

type CaptureLogInput = {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  ip?: string | null;
  userAgent?: string | null;
  queryJson?: Record<string, unknown> | null;
  requestBodyJson?: Record<string, unknown> | null;
  responsePreview?: string | null;
  errorMessage?: string | null;
};

@Injectable()
export class ApiLogsService implements OnModuleInit {
  private readonly logger = new Logger(ApiLogsService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSchema();
  }

  async capture(input: CaptureLogInput): Promise<void> {
    await this.dataSource.query(
      `
      INSERT INTO api_request_logs (
        method,
        path,
        status_code,
        duration_ms,
        ip,
        user_agent,
        query_json,
        request_body_json,
        response_preview,
        error_message
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10
      )
      `,
      [
        input.method,
        input.path,
        input.statusCode,
        input.durationMs,
        input.ip ?? null,
        input.userAgent ?? null,
        JSON.stringify(input.queryJson ?? {}),
        JSON.stringify(input.requestBodyJson ?? {}),
        input.responsePreview ?? null,
        input.errorMessage ?? null,
      ],
    );
  }

  async list(params: {
    limit?: number;
    offset?: number;
    method?: string;
    statusMin?: number;
    statusMax?: number;
    search?: string;
  }) {
    const limit = Math.min(500, Math.max(1, Number(params.limit ?? 100)));
    const offset = Math.max(0, Number(params.offset ?? 0));
    const filters: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (params.method?.trim()) {
      filters.push(`method = $${i++}`);
      values.push(params.method.trim().toUpperCase());
    }
    if (Number.isFinite(params.statusMin)) {
      filters.push(`status_code >= $${i++}`);
      values.push(Number(params.statusMin));
    }
    if (Number.isFinite(params.statusMax)) {
      filters.push(`status_code <= $${i++}`);
      values.push(Number(params.statusMax));
    }
    if (params.search?.trim()) {
      filters.push(`(path ILIKE $${i} OR COALESCE(error_message, '') ILIKE $${i})`);
      values.push(`%${params.search.trim()}%`);
      i += 1;
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT id, method, path, status_code, duration_ms, ip, user_agent,
             query_json, request_body_json, response_preview, error_message, created_at
      FROM api_request_logs
      ${where}
      ORDER BY id DESC
      LIMIT $${i++}
      OFFSET $${i++}
      `,
      [...values, limit, offset],
    );

    const countRows = await this.dataSource.query<any[]>(
      `
      SELECT COUNT(*)::int AS total
      FROM api_request_logs
      ${where}
      `,
      values,
    );

    const metricsRows = await this.dataSource.query<any[]>(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status_code >= 500)::int AS total5xx,
        COUNT(*) FILTER (WHERE status_code >= 400 AND status_code < 500)::int AS total4xx,
        COALESCE(ROUND(AVG(duration_ms)::numeric, 2), 0) AS avg_ms
      FROM api_request_logs
      WHERE created_at >= NOW() - INTERVAL '15 minutes'
      `,
    );

    return {
      total: Number(countRows[0]?.total ?? 0),
      items: rows,
      metrics15m: {
        total: Number(metricsRows[0]?.total ?? 0),
        total4xx: Number(metricsRows[0]?.total4xx ?? 0),
        total5xx: Number(metricsRows[0]?.total5xx ?? 0),
        avgMs: Number(metricsRows[0]?.avg_ms ?? 0),
      },
      paging: { limit, offset },
    };
  }

  async grafanaTimeseries(params: {
    from?: string;
    to?: string;
    intervalMinutes?: number;
  }) {
    const from = params.from ? new Date(params.from) : new Date(Date.now() - 6 * 60 * 60 * 1000);
    const to = params.to ? new Date(params.to) : new Date();
    const intervalMinutes = Math.min(60, Math.max(1, Number(params.intervalMinutes ?? 5)));

    const rows = await this.dataSource.query<any[]>(
      `
      WITH base AS (
        SELECT
          to_timestamp(
            floor(extract(epoch from created_at) / ($3::int * 60)) * ($3::int * 60)
          ) AS bucket,
          status_code,
          duration_ms
        FROM api_request_logs
        WHERE created_at >= $1::timestamptz
          AND created_at <= $2::timestamptz
      )
      SELECT
        bucket AS time,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status_code BETWEEN 200 AND 299)::int AS total2xx,
        COUNT(*) FILTER (WHERE status_code BETWEEN 400 AND 499)::int AS total4xx,
        COUNT(*) FILTER (WHERE status_code >= 500)::int AS total5xx,
        COALESCE(ROUND(AVG(duration_ms)::numeric, 2), 0) AS avg_ms,
        COALESCE(
          percentile_disc(0.95) WITHIN GROUP (ORDER BY duration_ms),
          0
        )::int AS p95_ms
      FROM base
      GROUP BY bucket
      ORDER BY bucket ASC
      `,
      [from.toISOString(), to.toISOString(), intervalMinutes],
    );

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      intervalMinutes,
      points: rows,
    };
  }

  async grafanaTopPaths(params: {
    from?: string;
    to?: string;
    limit?: number;
  }) {
    const from = params.from ? new Date(params.from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const to = params.to ? new Date(params.to) : new Date();
    const limit = Math.min(50, Math.max(1, Number(params.limit ?? 15)));

    const rows = await this.dataSource.query<any[]>(
      `
      SELECT
        path,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status_code BETWEEN 400 AND 499)::int AS total4xx,
        COUNT(*) FILTER (WHERE status_code >= 500)::int AS total5xx,
        COALESCE(ROUND(AVG(duration_ms)::numeric, 2), 0) AS avg_ms,
        COALESCE(
          percentile_disc(0.95) WITHIN GROUP (ORDER BY duration_ms),
          0
        )::int AS p95_ms
      FROM api_request_logs
      WHERE created_at >= $1::timestamptz
        AND created_at <= $2::timestamptz
      GROUP BY path
      ORDER BY total DESC
      LIMIT $3
      `,
      [from.toISOString(), to.toISOString(), limit],
    );

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      limit,
      items: rows,
    };
  }

  private async ensureSchema(): Promise<void> {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS api_request_logs (
        id BIGSERIAL PRIMARY KEY,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        status_code INT NOT NULL,
        duration_ms INT NOT NULL,
        ip TEXT NULL,
        user_agent TEXT NULL,
        query_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        request_body_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        response_preview TEXT NULL,
        error_message TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await this.dataSource.query(
      `CREATE INDEX IF NOT EXISTS idx_api_logs_created_at ON api_request_logs(created_at DESC);`,
    );
    await this.dataSource.query(
      `CREATE INDEX IF NOT EXISTS idx_api_logs_status ON api_request_logs(status_code);`,
    );
    await this.dataSource.query(
      `CREATE INDEX IF NOT EXISTS idx_api_logs_method ON api_request_logs(method);`,
    );
    await this.dataSource.query(`
      CREATE OR REPLACE VIEW api_request_logs_grafana_v1 AS
      SELECT
        created_at AS "time",
        method,
        path,
        status_code,
        duration_ms,
        ip,
        user_agent,
        error_message
      FROM api_request_logs;
    `);

    this.logger.log('API logs table ready');
  }
}
