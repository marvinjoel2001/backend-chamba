import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request, Response } from 'express';

@Injectable()
export class HttpLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const startMs = Date.now();

    const method = req.method;
    const url = req.originalUrl ?? req.url;

    // Log request body (omit passwords)
    const body = this.sanitizeBody(req.body);
    const query = Object.keys(req.query ?? {}).length ? req.query : undefined;

    this.logger.log(
      `→ ${method} ${url}` +
        (query ? `  query=${JSON.stringify(query)}` : '') +
        (body ? `  body=${JSON.stringify(body)}` : ''),
    );

    return next.handle().pipe(
      tap({
        next: (responseBody: unknown) => {
          const ms = Date.now() - startMs;
          const status = res.statusCode;
          const preview = this.previewBody(responseBody);
          this.logger.log(
            `← ${status} ${method} ${url}  ${ms}ms  ${preview}`,
          );
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
            `✗ ${status} ${method} ${url}  ${ms}ms  ${message}`,
          );
        },
      }),
    );
  }

  private sanitizeBody(body: unknown): unknown {
    if (!body || typeof body !== 'object') return body;
    const clone = { ...(body as Record<string, unknown>) };
    for (const key of ['password', 'token', 'secret', 'apiKey', 'privateKey']) {
      if (key in clone) clone[key] = '***';
    }
    return clone;
  }

  private previewBody(body: unknown): string {
    if (body === undefined || body === null) return '(empty)';
    try {
      const str = JSON.stringify(body);
      return str.length > 200 ? str.slice(0, 200) + '…' : str;
    } catch {
      return '(unserializable)';
    }
  }
}
