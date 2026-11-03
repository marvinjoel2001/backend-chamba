import { createHash } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.constants';
import type { RedisClient } from '../../infrastructure/redis/redis.types';

export const MAX_LOGIN_ATTEMPTS = 5;
export const LOGIN_LOCK_SECONDS = 15 * 60;

export type LoginScope = 'mobile' | 'admin' | 'agency';

type LoginCounter = Pick<
  RedisClient,
  'get' | 'ttl' | 'incr' | 'expire' | 'del'
>;

/**
 * Límite de intentos de contraseña: con 5 fallos seguidos esa cuenta queda
 * bloqueada 15 minutos, aunque después se escriba la contraseña correcta.
 * El contador vive en Redis y se borra al entrar bien. Si Redis falla, el
 * login sigue funcionando (no se deja a todos afuera por una caída).
 */
@Injectable()
export class LoginAttemptsService {
  private readonly logger = new Logger(LoginAttemptsService.name);

  constructor(
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: LoginCounter,
  ) {}

  private key(scope: LoginScope, subject: string): string {
    const digest = createHash('sha256')
      .update(subject.trim().toLowerCase())
      .digest('hex')
      .slice(0, 40);
    return `login:fail:${scope}:${digest}`;
  }

  /** Lanza 429 si la cuenta está bloqueada por intentos fallidos. */
  async assertAllowed(scope: LoginScope, subject: string): Promise<void> {
    if (!this.redis) return;
    const key = this.key(scope, subject);
    let count = 0;
    let ttl = LOGIN_LOCK_SECONDS;
    try {
      const [raw, left] = await Promise.all([
        this.redis.get(key),
        this.redis.ttl(key),
      ]);
      count = Number(raw ?? 0);
      if (Number(left) > 0) ttl = Number(left);
    } catch (error) {
      this.logger.warn(
        `No se pudo leer el contador de intentos: ${(error as Error).message}`,
      );
      return;
    }
    if (count >= MAX_LOGIN_ATTEMPTS) throw this.lockedError(scope, ttl);
  }

  /** Suma un intento fallido y devuelve cuántos quedan (0 = quedó bloqueada). */
  async recordFailure(scope: LoginScope, subject: string): Promise<number> {
    if (!this.redis) return MAX_LOGIN_ATTEMPTS;
    const key = this.key(scope, subject);
    try {
      const count = Number(await this.redis.incr(key));
      // El bloqueo dura 15 minutos contados desde el quinto fallo.
      if (count === 1 || count >= MAX_LOGIN_ATTEMPTS) {
        await this.redis.expire(key, LOGIN_LOCK_SECONDS);
      }
      return Math.max(0, MAX_LOGIN_ATTEMPTS - count);
    } catch (error) {
      this.logger.warn(
        `No se pudo guardar el intento fallido: ${(error as Error).message}`,
      );
      return MAX_LOGIN_ATTEMPTS;
    }
  }

  /** Login correcto (o contraseña nueva): se borran los fallos. */
  async reset(scope: LoginScope, subject: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(this.key(scope, subject));
    } catch (error) {
      this.logger.warn(
        `No se pudo limpiar el contador de intentos: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Para el mensaje del 401: avisa cuántos intentos quedan cuando ya son
   * pocos, y lanza el 429 cuando se agotaron.
   */
  invalidCredentialsMessage(
    scope: LoginScope,
    remaining: number,
    base: string,
  ): string {
    if (remaining <= 0) throw this.lockedError(scope, LOGIN_LOCK_SECONDS);
    if (remaining > 2) return base;
    return `${base}. Te ${remaining === 1 ? 'queda 1 intento' : `quedan ${remaining} intentos`} antes de que la cuenta se bloquee 15 minutos.`;
  }

  lockedError(scope: LoginScope, ttlSeconds: number): HttpException {
    const minutes = Math.max(1, Math.ceil(ttlSeconds / 60));
    const wait = `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
    const message =
      scope === 'mobile'
        ? `Demasiados intentos fallidos. Por seguridad la cuenta quedó bloqueada; intenta de nuevo en ${wait} o usa "Olvidé mi contraseña".`
        : `Demasiados intentos fallidos. Por seguridad la cuenta quedó bloqueada; intenta de nuevo en ${wait}.`;
    return new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message,
        retryAfterSeconds: ttlSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
