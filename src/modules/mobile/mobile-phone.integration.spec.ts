import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { VerifiedPhones1793656000000 } from '../../infrastructure/database/migrations/1793656000000-VerifiedPhones';
import { MobileService } from './mobile.service';
import { MobileGeoHelpers } from './shared/mobile-geo.helpers';

const url = process.env.PHONE_TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  'Verified signup in disposable PostgreSQL',
  () => {
    let db: DataSource, service: MobileService;
    const verifyProof = jest.fn(async () => ({
      e164: '+59170000000',
      uid: 'firebase-user',
    }));
    const input = {
      type: 'client',
      source: 'web',
      email: 'verified@example.test',
      firstName: 'Cliente de prueba',
      phone: '+59170000000',
      phoneIdToken: 'signed-proof',
      password: 'test-secret-123',
    };
    beforeAll(async () => {
      const parsed = new URL(url!);
      if (
        !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
        !parsed.pathname.endsWith('_verification')
      )
        throw new Error('Use a disposable local *_verification database');
      db = new DataSource({ type: 'postgres', url });
      await db.initialize();
      await db.query(`CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),type text,email text UNIQUE,phone text,
      first_name text,last_name text,is_available boolean,is_blocked boolean DEFAULT false,deleted_at timestamptz,is_agency_worker boolean DEFAULT false,agency_id uuid,
      ci_number text,country_code text,google_id text,profile_photo_url text,verification_status text DEFAULT 'not_verified',
      id_photo_url text,face_photo_url text,id_photo_verified boolean,face_photo_verified boolean);
      CREATE TABLE auth_credentials(user_id uuid PRIMARY KEY REFERENCES users(id),password text);`);
      await new VerifiedPhones1793656000000().up(db.createQueryRunner());
      const args: any[] = Array(16).fill({});
      args[1] = db;
      args[6] = new MobileGeoHelpers({} as any);
      args[14] = {
        issueMobile: () => 'signed-session',
        verifyGoogleRegistration: () => ({
          email: 'google@example.test',
          firstName: 'Google',
          googleId: 'google-id',
        }),
      };
      args[15] = {
        verify: verifyProof,
      };
      service = new MobileService(
        ...(args as ConstructorParameters<typeof MobileService>),
      );
    });
    beforeEach(async () => {
      await db.query('TRUNCATE auth_credentials,users');
      verifyProof.mockClear();
    });
    afterAll(async () => {
      if (db?.isInitialized) {
        await new VerifiedPhones1793656000000().down(db.createQueryRunner());
        await db.query('DROP TABLE auth_credentials;DROP TABLE users');
        await db.destroy();
      }
    });
    it('persists proof atomically, preserves it on format changes and invalidates it on a different phone', async () => {
      const result = await service.register(input);
      const [row] = await db.query('SELECT * FROM users WHERE id=$1', [
        result.user.id,
      ]);
      expect(row.phone_e164).toBe('+59170000000');
      expect(row.phone_verified_at).toBeInstanceOf(Date);
      expect(row.firebase_phone_uid).toBe('firebase-user');
      const [credential] = await db.query(
        'SELECT password FROM auth_credentials WHERE user_id=$1',
        [row.id],
      );
      expect(credential.password).toMatch(/^\$2/);
      expect((await service.login('70000000', input.password)).user.id).toBe(
        row.id,
      );
      expect(verifyProof).toHaveBeenCalledTimes(1);
      await db.query('UPDATE users SET phone=$2 WHERE id=$1', [
        row.id,
        '+591 70000000',
      ]);
      expect(
        (await service.login('+59170000000', input.password)).user.id,
      ).toBe(row.id);
      expect(verifyProof).toHaveBeenCalledTimes(1);
      expect(
        (
          await db.query('SELECT phone_verified_at FROM users WHERE id=$1', [
            row.id,
          ])
        )[0].phone_verified_at,
      ).not.toBeNull();
      await db.query('UPDATE users SET phone=$2 WHERE id=$1', [
        row.id,
        '71111111',
      ]);
      expect(
        (
          await db.query(
            'SELECT phone_verified_at,phone_e164 FROM users WHERE id=$1',
            [row.id],
          )
        )[0],
      ).toEqual({ phone_verified_at: null, phone_e164: null });
    });
    it('rejects a phone already attached to a legacy account, even with a different format', async () => {
      await db.query(
        `INSERT INTO users(id,type,email,phone) VALUES($1,'client','legacy@example.test','+591 70000000')`,
        [randomUUID()],
      );
      await expect(service.register(input)).rejects.toThrow('registrado');
      expect(
        (await db.query('SELECT count(*)::int AS n FROM auth_credentials'))[0]
          .n,
      ).toBe(0);
    });
    it('a replay cannot create two accounts with the same proof under concurrent requests', async () => {
      const results = await Promise.allSettled([
        service.register(input),
        service.register({ ...input, email: 'other@example.test' }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(
        (await db.query('SELECT count(*)::int AS n FROM users'))[0].n,
      ).toBe(1);
    });
    it('Google signup saves the same proven phone without asking for SMS on future logins', async () => {
      const result = await service.googleRegister({
        registrationToken: 'google-proof',
        email: 'ignored',
        firstName: 'ignored',
        googleId: 'ignored',
        type: 'client',
        phone: input.phone,
        phoneIdToken: input.phoneIdToken,
      });
      const [row] = await db.query(
        'SELECT phone_e164,phone_verified_at,google_id FROM users WHERE id=$1',
        [result.user.id],
      );
      expect(row.phone_e164).toBe('+59170000000');
      expect(row.phone_verified_at).toBeInstanceOf(Date);
      expect(row.google_id).toBe('google-id');
    });
  },
);
