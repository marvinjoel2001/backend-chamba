import { HttpException } from '@nestjs/common';
import {
  LOGIN_LOCK_SECONDS,
  LoginAttemptsService,
  MAX_LOGIN_ATTEMPTS,
} from './login-attempts.service';

/** Redis en memoria con lo justo para el contador. */
function fakeRedis() {
  const values = new Map<string, number>();
  const ttls = new Map<string, number>();
  return {
    values,
    ttls,
    get: jest.fn(async (key: string) =>
      values.has(key) ? String(values.get(key)) : null,
    ),
    ttl: jest.fn(async (key: string) => ttls.get(key) ?? -2),
    incr: jest.fn(async (key: string) => {
      const next = (values.get(key) ?? 0) + 1;
      values.set(key, next);
      return next;
    }),
    expire: jest.fn(async (key: string, seconds: number) => {
      ttls.set(key, seconds);
      return 1;
    }),
    del: jest.fn(async (key: string) => {
      values.delete(key);
      ttls.delete(key);
      return 1;
    }),
  };
}

describe('LoginAttemptsService', () => {
  it('bloquea la cuenta 15 minutos al quinto intento fallido', async () => {
    const redis = fakeRedis();
    const attempts = new LoginAttemptsService(redis as any);

    for (let i = 1; i < MAX_LOGIN_ATTEMPTS; i++) {
      await attempts.assertAllowed('mobile', 'user:1');
      await expect(attempts.recordFailure('mobile', 'user:1')).resolves.toBe(
        MAX_LOGIN_ATTEMPTS - i,
      );
    }
    await attempts.assertAllowed('mobile', 'user:1');
    await expect(attempts.recordFailure('mobile', 'user:1')).resolves.toBe(0);

    const blocked = attempts.assertAllowed('mobile', 'user:1');
    await expect(blocked).rejects.toBeInstanceOf(HttpException);
    await expect(
      attempts.assertAllowed('mobile', 'user:1'),
    ).rejects.toMatchObject({ status: 429 });
    expect([...redis.ttls.values()]).toEqual([LOGIN_LOCK_SECONDS]);

    // Otra cuenta no se ve afectada.
    await expect(
      attempts.assertAllowed('mobile', 'user:2'),
    ).resolves.toBeUndefined();
  });

  it('un login correcto borra los fallos', async () => {
    const redis = fakeRedis();
    const attempts = new LoginAttemptsService(redis as any);
    await attempts.recordFailure('admin', 'Admin');
    await attempts.recordFailure('admin', 'admin ');
    expect([...redis.values.values()]).toEqual([2]); // mismo usuario aunque cambie mayúsculas/espacios
    await attempts.reset('admin', 'admin');
    expect(redis.values.size).toBe(0);
  });

  it('el mensaje avisa cuando quedan pocos intentos y bloquea al llegar a cero', () => {
    const attempts = new LoginAttemptsService(fakeRedis() as any);
    expect(
      attempts.invalidCredentialsMessage('mobile', 3, 'Credenciales invalidas'),
    ).toBe('Credenciales invalidas');
    expect(
      attempts.invalidCredentialsMessage('mobile', 1, 'Credenciales invalidas'),
    ).toContain('Te queda 1 intento');
    expect(() => attempts.invalidCredentialsMessage('mobile', 0, 'x')).toThrow(
      'Olvidé mi contraseña',
    );
    expect(() =>
      attempts.invalidCredentialsMessage('agency', 0, 'x'),
    ).not.toThrow('Olvidé');
  });

  it('si Redis falla, el login sigue funcionando', async () => {
    const broken = {
      get: jest.fn().mockRejectedValue(new Error('down')),
      ttl: jest.fn().mockRejectedValue(new Error('down')),
      incr: jest.fn().mockRejectedValue(new Error('down')),
      expire: jest.fn(),
      del: jest.fn().mockRejectedValue(new Error('down')),
    };
    const attempts = new LoginAttemptsService(broken as any);
    await expect(
      attempts.assertAllowed('mobile', 'x'),
    ).resolves.toBeUndefined();
    await expect(attempts.recordFailure('mobile', 'x')).resolves.toBe(
      MAX_LOGIN_ATTEMPTS,
    );
    await expect(attempts.reset('mobile', 'x')).resolves.toBeUndefined();
  });
});
