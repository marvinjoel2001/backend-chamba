import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request, Response } from 'express';
import { ApiLogsService } from '../../modules/api-logs/api-logs.service';

/**
 * Campos que nunca se guardan en los logs (consola de Railway y tabla
 * api_request_logs, visible en Admin → Logs): contraseñas, tokens, claves
 * (geminiKey, nvidiaKey, secretKey…), fotos en base64 (carnet, selfie,
 * solicitudes, chat), el número de carnet y las URL de las fotos de
 * verificación.
 */
const SENSITIVE_KEY =
  /password|token|secret|authorization|signature|key$|api.?key|private.?key|base64|ci_?number|(id|face)_?photo/i;

/** Textos más largos que esto (p. ej. una imagen sin prefijo data:) se recortan. */
const MAX_LOGGED_TEXT = 500;

export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    if (/^data:/i.test(value)) return `[archivo omitido: ${value.length} caracteres]`;
    return value.length > MAX_LOGGED_TEXT
      ? `${value.slice(0, 80)}… [${value.length} caracteres]`
      : value;
  }
  if (!value || typeof value !== 'object') return value;
  if (depth > 6) return '[…]';
  if (Array.isArray(value)) return value.map((item) => sanitizeForLog(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? '***' : sanitizeForLog(item, depth + 1),
    ]),
  );
}

@Injectable()
export class HttpLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly apiLogsService: ApiLogsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const startMs = Date.now();

    const method = req.method;
    const url = req.originalUrl ?? req.url;
    const userAgent = Array.isArray(req.headers['user-agent'])
      ? req.headers['user-agent'].join('; ')
      : (req.headers['user-agent'] ?? null);

    const body = this.sanitizeBody(req.body);
    const query = Object.keys(req.query ?? {}).length ? this.sanitizeBody(req.query) : undefined;

    this.logger.log(
      `-> ${method} ${url}` +
        (query ? `  query=${JSON.stringify(query)}` : '') +
        (body ? `  body=${JSON.stringify(body)}` : ''),
    );

    return next.handle().pipe(
      tap({
        next: (responseBody: unknown) => {
          const ms = Date.now() - startMs;
          const status = res.statusCode;
          const preview = this.previewBody(responseBody);
          this.logger.log(`<- ${status} ${method} ${url}  ${ms}ms  ${preview}`);
          void this.apiLogsService
            .capture({
              method,
              path: url,
              statusCode: status,
              durationMs: ms,
              ip: req.ip ?? null,
              userAgent,
              queryJson: this.toPlainObject(query),
              requestBodyJson: this.toPlainObject(body),
              responsePreview: preview,
              errorMessage: null,
            })
            .catch(() => undefined);
        },
        error: (err: unknown) => {
          const ms = Date.now() - startMs;
          const status =
            (err as { status?: number; statusCode?: number })?.status ??
            (err as { status?: number; statusCode?: number })?.statusCode ??
            500;
          const message =
            (err as { message?: string })?.message ?? 'Unknown error';
          this.logger.error(
            `x ${status} ${method} ${url}  ${ms}ms  ${message}`,
          );
          void this.apiLogsService
            .capture({
              method,
              path: url,
              statusCode: status,
              durationMs: ms,
              ip: req.ip ?? null,
              userAgent,
              queryJson: this.toPlainObject(query),
              requestBodyJson: this.toPlainObject(body),
              responsePreview: null,
              errorMessage: message,
            })
            .catch(() => undefined);
        },
      }),
    );
  }

  private sanitizeBody(body: unknown): unknown {
    return sanitizeForLog(body);
  }

  private previewBody(body: unknown): string {
    if (body === undefined || body === null) return '(empty)';
    try {
      const str = JSON.stringify(this.sanitizeBody(body));
      return str.length > 200 ? str.slice(0, 200) + '...' : str;
    } catch {
      return '(unserializable)';
    }
  }

  private toPlainObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }
}
