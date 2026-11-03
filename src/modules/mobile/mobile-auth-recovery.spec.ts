import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import {
  AccessService,
  issuedBeforeRevocation,
} from '../access/access.service';
import { LoginAttemptsService } from '../access/login-attempts.service';
import { MobileService } from './mobile.service';

const SECRET = 'test-secret-with-at-least-32-characters';
const WEB_CLIENT_ID = 'web-client.apps.googleusercontent.com';

/** Respuesta de tokeninfo de Google para un idToken válido. */
function mockGoogle(email: string, sub = 'google-sub-1') {
  return jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({
      aud: WEB_CLIENT_ID,
      email_verified: 'true',
      iss: 'https://accounts.google.com',
      email,
      sub,
      given_name: 'Ana',
      family_name: 'Rojas',
    }),
  } as any);
}

function fakeRedis() {
  const values = new Map<string, number>();
  return {
    values,
    get: jest.fn(async (key: string) =>
      values.has(key) ? String(values.get(key)) : null,
    ),
    ttl: jest.fn(async () => 900),
    incr: jest.fn(async (key: string) => {
      values.set(key, (values.get(key) ?? 0) + 1);
      return values.get(key);
    }),
    expire: jest.fn(async () => 1),
    del: jest.fn(async (key: string) => values.delete(key)),
  };
}

describe('Cuenta de la app: intentos, recuperación con Google y vinculación', () => {
  const USER_ID = '6f1c2a8e-1111-4c3a-9a55-0d7b6c1e2f30';
  let db: any;
  let manager: any;
  let access: AccessService;
  let redis: ReturnType<typeof fakeRedis>;
  let service: MobileService;
  let account: any;

  beforeEach(() => {
    account = {
      id: USER_ID,
      type: 'client',
      first_name: 'Ana',
      last_name: 'Rojas',
      email: 'ana@gmail.com',
      phone: null,
      is_blocked: false,
      google_id: null,
      has_password: true,
      tokens_valid_after: null,
      verification_status: 'not_verified',
    };
    manager = { query: jest.fn(async () => []) };
    db = {
      transaction: jest.fn(async (fn: any) => fn(manager)),
      query: jest.fn(async (sql: string) => {
        if (
          sql.includes('JOIN auth_credentials c ON c.user_id = u.id') &&
          sql.includes('c.password AS password')
        ) {
          return [
            { ...account, password: await bcrypt.hash('clave-correcta', 4) },
          ];
        }
        return [account];
      }),
    };
    const config = new ConfigService({ GOOGLE_WEB_CLIENT_ID: WEB_CLIENT_ID });
    access = new AccessService(
      new JwtService(),
      { get: () => SECRET, getOrThrow: () => SECRET } as any,
      db,
    );
    redis = fakeRedis();
    const args: any[] = Array(17).fill({});
    args[0] = config;
    args[1] = db;
    args[6] = {
      normalizePhone: (value?: string) =>
        value ? value.replace(/\D/g, '') : null,
    };
    args[14] = access;
    args[16] = new LoginAttemptsService(redis as any);
    service = new MobileService(
      ...(args as ConstructorParameters<typeof MobileService>),
    );
  });

  afterEach(() => jest.restoreAllMocks());

  describe('límite de 5 intentos', () => {
    it('al quinto fallo bloquea aunque después pongan la contraseña correcta', async () => {
      for (let i = 0; i < 4; i++) {
        await expect(
          service.login('ana@gmail.com', 'mala'),
        ).rejects.toMatchObject({ status: 401 });
      }
      await expect(
        service.login('ana@gmail.com', 'mala'),
      ).rejects.toMatchObject({ status: 429 });
      await expect(
        service.login('ana@gmail.com', 'clave-correcta'),
      ).rejects.toMatchObject({ status: 429 });
    });

    it('avisa cuántos intentos quedan y un acierto reinicia el contador', async () => {
      await service.login('ana@gmail.com', 'mala').catch(() => undefined);
      await service.login('ana@gmail.com', 'mala').catch(() => undefined);
      await expect(service.login('ana@gmail.com', 'mala')).rejects.toThrow(
        'Te quedan 2 intentos',
      );
      await expect(
        service.login('ana@gmail.com', 'clave-correcta'),
      ).resolves.toMatchObject({
        user: { id: USER_ID },
      });
      expect(redis.values.size).toBe(0);
    });
  });

  describe('recuperar contraseña con Google', () => {
    it('con el correo de la cuenta entrega un token y guarda la contraseña nueva', async () => {
      mockGoogle('Ana@gmail.com');
      const started = await service.startGooglePasswordReset('id-token');
      expect(started).toMatchObject({
        email: 'ana@gmail.com',
        firstName: 'Ana',
        hadPassword: true,
      });

      const done = await service.completeGooglePasswordReset(
        started.resetToken,
        '  nueva-clave-segura ',
      );
      expect(done.user.id).toBe(USER_ID);
      expect(done.token).toBeTruthy();

      const [credSql, credArgs] = manager.query.mock.calls[0];
      expect(credSql).toContain('INSERT INTO auth_credentials');
      expect(await bcrypt.compare('nueva-clave-segura', credArgs[1])).toBe(
        true,
      );
      const [userSql, userArgs] = manager.query.mock.calls[1];
      expect(userSql).toContain('google_id = COALESCE(google_id, $2)');
      expect(userSql).toContain('tokens_valid_after = $3');
      expect(userArgs[1]).toBe('google-sub-1');
    });

    it('sin cuenta con ese correo explica qué cuenta de Google elegir', async () => {
      mockGoogle('otra@gmail.com');
      db.query.mockResolvedValueOnce([]);
      await expect(
        service.startGooglePasswordReset('id-token'),
      ).rejects.toThrow('No hay una cuenta de Chamba con otra@gmail.com');
    });

    it('no deja recuperar una cuenta vinculada a otra cuenta de Google', async () => {
      mockGoogle('ana@gmail.com', 'google-sub-1');
      account.google_id = 'otro-sub';
      await expect(
        service.startGooglePasswordReset('id-token'),
      ).rejects.toThrow('otra cuenta de Google');
    });

    it('exige 8 caracteres y el token sirve una sola vez', async () => {
      mockGoogle('ana@gmail.com');
      const { resetToken } = await service.startGooglePasswordReset('id-token');
      await expect(
        service.completeGooglePasswordReset(resetToken, 'corta'),
      ).rejects.toThrow('8 caracteres');

      // Ya se usó: la cuenta cerró sesiones después de emitir el token.
      account.tokens_valid_after = new Date(Date.now() + 5_000);
      await expect(
        service.completeGooglePasswordReset(resetToken, 'otra-clave-larga'),
      ).rejects.toThrow('venció');
    });

    it('un token de recuperación no sirve como sesión de la app', async () => {
      const resetToken = access.issuePasswordReset(USER_ID, 'google-sub-1');
      await expect(access.authenticate(resetToken)).rejects.toMatchObject({
        status: 401,
      });
    });
  });

  describe('punto 13: entrar con Google a una cuenta creada con contraseña', () => {
    it('vincula Google, desactiva la contraseña anterior y cierra las otras sesiones', async () => {
      mockGoogle('ana@gmail.com');
      const result: any = await service.googleLogin('id-token');
      expect(result.passwordDisabled).toBe(true);
      expect(result.token).toBeTruthy();

      const sqls = manager.query.mock.calls.map(([sql]: [string]) => sql);
      expect(sqls[0]).toContain('UPDATE users SET google_id = $1');
      expect(manager.query.mock.calls[0][1].slice(0, 3)).toEqual([
        'google-sub-1',
        USER_ID,
        true,
      ]);
      expect(sqls[1]).toContain('UPDATE auth_credentials SET password = NULL');
    });

    it('una cuenta ya vinculada entra normal, sin tocar la contraseña', async () => {
      mockGoogle('ana@gmail.com', 'google-sub-1');
      account.google_id = 'google-sub-1';
      const result: any = await service.googleLogin('id-token');
      expect(result.passwordDisabled).toBe(false);
      expect(manager.query).not.toHaveBeenCalled();
    });

    it('rechaza si el correo está vinculado a otra cuenta de Google', async () => {
      mockGoogle('ana@gmail.com', 'google-sub-nuevo');
      account.google_id = 'google-sub-1';
      await expect(service.googleLogin('id-token')).rejects.toThrow(
        'otra cuenta de Google',
      );
    });

    it('los tokens emitidos antes del cierre de sesiones dejan de valer', async () => {
      const oldToken = access.issueMobile(USER_ID, 'client');
      account.tokens_valid_after = new Date(Date.now() + 2_000);
      await expect(access.authenticate(oldToken)).rejects.toThrow(
        'Tu sesión se cerró',
      );
      expect(
        issuedBeforeRevocation(
          Math.floor(Date.now() / 1000) + 10,
          account.tokens_valid_after,
        ),
      ).toBe(false);
      expect(issuedBeforeRevocation(123, null)).toBe(false);
    });
  });
});
