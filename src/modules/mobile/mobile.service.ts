import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { AccessService, issuedBeforeRevocation } from '../access/access.service';
import { LoginAttemptsService } from '../access/login-attempts.service';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { MobileRequestRepository } from './shared/mobile-request.repository';
import { MobileGeoHelpers } from './shared/mobile-geo.helpers';
import { MobileCatalogService } from './services/mobile-catalog.service';
import { MobileChatService } from './services/mobile-chat.service';
import { MobileDisputesService } from './services/mobile-disputes.service';
import { MobileOffersService } from './services/mobile-offers.service';
import { MobileRequestsService } from './services/mobile-requests.service';
import { MobileUsersService } from './services/mobile-users.service';
import { MobileAdminService } from './services/mobile-admin.service';
import { WorkerLead } from '../worker-leads/entities/worker-lead.entity';
import { isEmail } from 'class-validator';
import { PhoneVerificationService } from './services/phone-verification.service';

type CreateRequestInput = {
  clientUserId: string;
  title: string;
  description: string;
  category?: string;
  aiCategories?: Array<{
    id: string;
    name: string;
    confidence: number;
  }>;
  budget: number;
  priceType: string;
  address: string;
  latitude: number;
  longitude: number;
  scheduledAt?: string;
  photosBase64?: string[];
  photos?: Array<{
    url?: string;
    publicId?: string;
    /** Comprobante que devuelve POST mobile/requests/photos/upload. */
    uploadToken?: string;
  }>;
  paymentMethod?: string;
  paymentMethodCode?: string;
  modality?: string;
  estimatedHours?: number;
  hourlyRate?: number;
  days?: number;
  dailyRate?: number;
  startDate?: string;
};

@Injectable()
export class MobileService implements OnModuleInit {
  private readonly logger = new Logger(MobileService.name);
  private static readonly OFFER_LIFETIME_SECONDS = 120;
  private static readonly OFFER_LIFETIME_CONFIG_KEY =
    'offer_lifetime_by_price_type';
  private static readonly WORKER_NOTIFICATION_RADIUS_CONFIG_KEY =
    'worker_notification_radius_km';
  private static readonly WORKER_NOTIFICATION_WAVE_SIZE = 5;
  private static readonly WORKER_NOTIFICATION_WAVE_DELAY_MS = 7000;
  private static readonly DEFAULT_CATEGORY = 'General';
  private static readonly GEMINI_TIMEOUT_MS = 25000;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly storageService: StorageService,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly repo: MobileRequestRepository,
    private readonly geoHelpers: MobileGeoHelpers,
    private readonly catalogService: MobileCatalogService,
    private readonly chatService: MobileChatService,
    private readonly disputesService: MobileDisputesService,
    private readonly offersService: MobileOffersService,
    private readonly requestsService: MobileRequestsService,
    private readonly usersService: MobileUsersService,
    private readonly adminService: MobileAdminService,
    private readonly access: AccessService,
    private readonly phoneVerification: PhoneVerificationService,
    @Optional() private readonly loginAttempts?: LoginAttemptsService,
  ) {}

  async onModuleInit(): Promise<void> {
    // El esquema lo manejan las migraciones (database.module.ts → migrationsRun).
    await this.seedBaseData();
  }

  async register(input: {
    type?: string;
    email: string;
    phone?: string;
    firstName: string;
    lastName?: string;
    password: string;
    ciNumber?: string;
    source?: string;
    countryCode?: string;
    phoneIdToken?: string;
  }) {
    const type = (input.type ?? 'client').toLowerCase().trim();
    if (type !== 'client' && type !== 'worker') {
      throw new BadRequestException('type must be client or worker');
    }

    const email = input.email?.trim().toLowerCase();
    if (!email) {
      throw new BadRequestException('email is required');
    }

    const firstName = input.firstName?.trim();
    if (!firstName) {
      throw new BadRequestException('firstName is required');
    }

    const password = input.password?.trim();
    if (!password || password.length < 4) {
      throw new BadRequestException('password must be at least 4 characters');
    }

    const proof = await this.phoneVerification.verify(input);
    const phone = this.geoHelpers.normalizePhone(proof?.e164 ?? input.phone);
    const lastName = input.lastName?.trim() || null;

    // Web signup creates the same account used by the mobile app. Save the
    // contact request in the same transaction so success also guarantees follow-up.
    const isWebWorker = input.source === 'web' && type === 'worker';
    if (input.source === 'web' && (!isEmail(email) || !phone || !/^\d{7,15}$/.test(phone) ||
        password.length < 8 || Buffer.byteLength(password, 'utf8') > 72)) {
      throw new BadRequestException('Revisa tu correo, telefono y contraseña');
    }

    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.query<any[]>(
        `
        SELECT id
        FROM users
        WHERE LOWER(email) = LOWER($1)
           OR (
             $2::text IS NOT NULL
             AND (regexp_replace(COALESCE(phone, ''), '[^0-9]+', '', 'g') = $2
               OR ($3::text IS NOT NULL AND (phone_e164 = $3 OR
                 regexp_replace(COALESCE(phone, ''), '[^0-9]+', '', 'g') = replace($3,'+',''))))
           )
        LIMIT 1
        `,
        [email, phone, proof?.e164 ?? null],
      );

      if (existing[0]) {
        throw new ConflictException('El correo o telefono ya esta registrado');
      }

      const ciNumber = input.ciNumber?.trim() || null;
      const createdRows = await manager.query<any[]>(
        `
        INSERT INTO users (
          type,
          email,
          phone,
          first_name,
          last_name,
          is_available,
          ci_number, phone_e164, phone_verified_at, firebase_phone_uid, country_code
        )
        VALUES ($1, $2, $3, $4, $5, false, $6, $7::text, CASE WHEN $7::text IS NOT NULL THEN now() ELSE NULL END, $8, $9)
        RETURNING id, type, first_name, last_name, email, phone, profile_photo_url,
                  verification_status, id_photo_url, face_photo_url,
                  id_photo_verified, face_photo_verified, is_available, phone_verified_at
        `,
        [type, email, phone, firstName, lastName, ciNumber, proof?.e164 ?? null, proof?.uid ?? null,
          proof?.e164.startsWith('+591') ? '+591' : input.countryCode ?? null],
      );

      const created = createdRows[0];
      await manager.query(
        `
        INSERT INTO auth_credentials (user_id, password)
        VALUES ($1, $2)
        `,
        [created.id, await bcrypt.hash(password, 12)],
      );

      if (isWebWorker) {
        const lead = await manager.save(WorkerLead, manager.create(WorkerLead, {
          fullName: [firstName, lastName].filter(Boolean).join(' '),
          whatsapp: phone!,
          email,
          city: 'Por completar',
          category: 'Por completar',
          isContacted: false,
        }));
        this.realtimeGateway?.emitToAdmins?.('lead.new', lead);
      }

      return {
        token: this.access.issueMobile(created.id, created.type),
        user: {
          id: created.id,
          type: created.type,
          firstName: created.first_name,
          lastName: created.last_name ?? null,
          email: created.email,
          phone: created.phone ?? null,
          phoneVerifiedAt: created.phone_verified_at ?? null,
          profilePhotoUrl: created.profile_photo_url ?? null,
          verificationStatus: created.verification_status ?? 'not_verified',
          idPhotoUrl: created.id_photo_url ?? null,
          facePhotoUrl: created.face_photo_url ?? null,
          idPhotoVerified: created.id_photo_verified ?? null,
          facePhotoVerified: created.face_photo_verified ?? null,
          isAvailable: Boolean(created.is_available),
        },
      };
    }).catch(error => {
      if (error?.code === '23505') throw new ConflictException('El correo o teléfono ya está registrado.');
      throw error;
    });
  }

  async session(userId: string) {
    const [row] = await this.dataSource.query(`SELECT id,type,first_name,last_name,email,phone,phone_verified_at
      FROM users WHERE id=$1 AND NOT is_blocked AND deleted_at IS NULL`, [userId]);
    if (!row) throw new UnauthorizedException('Sesión inválida');
    return { user: { id: row.id, type: row.type, firstName: row.first_name, lastName: row.last_name,
      email: row.email, phone: row.phone, phoneVerifiedAt: row.phone_verified_at } };
  }

  async webJobs(userId: string) {
    const jobs = await this.dataSource.query(`SELECT id,title,description,status,budget::float8 AS budget,address,created_at AS "createdAt"
      FROM job_requests WHERE client_user_id=$1 ORDER BY created_at DESC LIMIT 30`, [userId]);
    return { jobs };
  }

  async login(identifier: string, password: string) {
    if (!identifier?.trim() || !password?.trim()) {
      throw new BadRequestException('identifier and password are required');
    }

    const normalizedEmail = identifier.trim().toLowerCase();
    const normalizedPhone = identifier.includes('@') ? null : this.geoHelpers.normalizePhone(identifier);

    const rows = await this.dataSource.query<any[]>(
      `
      SELECT u.id,
             u.type,
             u.first_name,
             u.last_name,
             u.email,
             u.phone,
             u.profile_photo_url,
             u.verification_status,
             u.id_photo_url,
             u.face_photo_url,
             u.id_photo_verified,
             u.face_photo_verified,
             u.is_blocked,
             u.is_agency_worker,
             u.agency_id,
             u.is_available, c.password AS password
      FROM users u
      JOIN auth_credentials c ON c.user_id = u.id
      WHERE (
          LOWER(u.email) = LOWER($1)
          OR (
            $2::text IS NOT NULL
            AND (regexp_replace(COALESCE(u.phone, ''), '[^0-9]+', '', 'g') = $2
              OR ($2 ~ '^[67][0-9]{7}$' AND regexp_replace(COALESCE(u.phone, ''), '[^0-9]+', '', 'g') = '591' || $2))
          )
        )
      LIMIT 1
      `,
      [normalizedEmail, normalizedPhone],
    );

    const row = rows[0];
    // Límite de intentos: por cuenta cuando existe (da igual si escribe el
    // correo o el teléfono) y, si no existe, por lo que escribió.
    const attemptsKey = row ? `user:${row.id}` : `ident:${normalizedPhone ?? normalizedEmail}`;
    await this.loginAttempts?.assertAllowed('mobile', attemptsKey);
    const validPassword = row?.password && (row.password.startsWith('$2')
      ? await bcrypt.compare(password.trim(), row.password) : row.password === password.trim());
    if (!row || !validPassword) {
      const remaining = await this.loginAttempts?.recordFailure('mobile', attemptsKey);
      throw new UnauthorizedException(remaining === undefined ? 'Credenciales invalidas'
        : this.loginAttempts!.invalidCredentialsMessage('mobile', remaining, 'Credenciales invalidas'));
    }
    if (row.is_blocked) throw new UnauthorizedException('Credenciales invalidas');
    await this.loginAttempts?.reset('mobile', attemptsKey);
    if (!row.password.startsWith('$2')) await this.dataSource.query(
      'UPDATE auth_credentials SET password = $2 WHERE user_id = $1', [row.id, await bcrypt.hash(password.trim(), 12)]);

    return {
      user: {
        id: row.id,
        type: row.type,
        firstName: row.first_name,
        lastName: row.last_name ?? null,
        email: row.email,
        phone: row.phone ?? null,
        profilePhotoUrl: row.profile_photo_url ?? null,
        verificationStatus: row.verification_status ?? 'not_verified',
        idPhotoUrl: row.id_photo_url ?? null,
        facePhotoUrl: row.face_photo_url ?? null,
        idPhotoVerified: row.id_photo_verified,
        facePhotoVerified: row.face_photo_verified,
        isBlocked: row.is_blocked,
        isAgencyWorker: row.is_agency_worker ?? false,
        agencyId: row.agency_id ?? null,
        isAvailable: Boolean(row.is_available),
      },
      token: this.access.issueMobile(row.id, row.type),
    };
  }

  private async verifyGoogleToken(idToken: string) {
    let response: Response;
    try {
      response = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      );
    } catch {
      throw new UnauthorizedException(
        'No se pudo conectar con Google para verificar el token',
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.warn(
        `[Google] tokeninfo HTTP ${response.status}: ${detail.slice(0, 200)}`,
      );
      throw new UnauthorizedException('Token de Google invalido o expirado');
    }

    const data = await response.json();

    const expectedAudience = this.configService.get<string>('GOOGLE_WEB_CLIENT_ID');
    if (!expectedAudience || data.aud !== expectedAudience || data.email_verified !== 'true'
      || !['accounts.google.com', 'https://accounts.google.com'].includes(data.iss)) {
      throw new UnauthorizedException('Token de Google no pertenece a esta aplicación');
    }
    if (!data.email || !data.sub) {
      throw new UnauthorizedException(
        'Token de Google no contiene email o id de usuario',
      );
    }

    return {
      email: data.email as string,
      firstName: (data.given_name as string) ?? '',
      lastName: (data.family_name as string) ?? null,
      googleId: data.sub as string,
    };
  }

  async googleLogin(idToken: string) {
    const googleData = await this.verifyGoogleToken(idToken);

    const rows = await this.dataSource.query<any[]>(
      `
      SELECT u.id, u.type, u.first_name, u.last_name, u.email, u.phone,
             u.profile_photo_url, u.verification_status, u.id_photo_url,
             u.face_photo_url, u.id_photo_verified, u.face_photo_verified, u.is_blocked,
             u.is_available, u.google_id, (c.password IS NOT NULL) AS has_password
      FROM users u
      LEFT JOIN auth_credentials c ON c.user_id = u.id
      WHERE LOWER(u.email) = LOWER($1) OR u.google_id = $2
      ORDER BY (u.google_id = $2) DESC NULLS LAST
      LIMIT 1
      `,
      [googleData.email, googleData.googleId],
    );

    const row = rows[0];

    if (!row) {
      return {
        requiresRegistration: true,
        googleData: { ...googleData, registrationToken: this.access.issueGoogleRegistration(googleData) },
      };
    }

    if (row.is_blocked) throw new UnauthorizedException('Cuenta bloqueada');
    if (row.google_id && row.google_id !== googleData.googleId) {
      throw new UnauthorizedException('Este correo ya está vinculado a otra cuenta de Google.');
    }
    // Primera vez con Google en una cuenta creada con contraseña: el registro
    // con correo no verifica el correo, así que esa contraseña pudo ponerla
    // otra persona. Google sí prueba que el correo es de quien entra, así que
    // se desactiva la contraseña anterior y se cierran las demás sesiones.
    // El usuario puede crear una nueva en "Olvidé mi contraseña".
    let passwordDisabled = false;
    if (!row.google_id) {
      passwordDisabled = row.has_password === true;
      await this.dataSource.transaction(async (manager) => {
        await manager.query(
          `UPDATE users SET google_id = $1, updated_at = NOW(),
             tokens_valid_after = CASE WHEN $3::boolean THEN $4::timestamptz ELSE tokens_valid_after END
           WHERE id = $2`,
          [googleData.googleId, row.id, passwordDisabled, new Date()],
        );
        if (passwordDisabled) {
          await manager.query(`UPDATE auth_credentials SET password = NULL WHERE user_id = $1`, [row.id]);
        }
      });
      if (passwordDisabled) {
        this.logger.log(`Cuenta ${row.id}: Google vinculado; contraseña anterior desactivada`);
      }
    }

    return {
      user: {
        id: row.id,
        type: row.type,
        firstName: row.first_name,
        lastName: row.last_name ?? null,
        email: row.email,
        phone: row.phone ?? null,
        profilePhotoUrl: row.profile_photo_url ?? null,
        verificationStatus: row.verification_status ?? 'not_verified',
        idPhotoUrl: row.id_photo_url ?? null,
        facePhotoUrl: row.face_photo_url ?? null,
        idPhotoVerified: row.id_photo_verified,
        facePhotoVerified: row.face_photo_verified,
        isBlocked: row.is_blocked,
        isAvailable: Boolean(row.is_available),
      },
      token: this.access.issueMobile(row.id, row.type),
      passwordDisabled,
    };
  }

  // ── Recuperar la contraseña con Google ─────────────────────────────
  // 1) La app inicia sesión con Google y manda el idToken: si el correo de esa
  //    cuenta de Google es el de una cuenta de Chamba, devuelve un token de
  //    10 minutos. 2) Con ese token se guarda la contraseña nueva, se vincula
  //    Google, se cierran las demás sesiones y la persona queda adentro.

  async startGooglePasswordReset(idToken: string) {
    if (!idToken?.trim()) throw new BadRequestException('Inicia sesión con Google para continuar.');
    const google = await this.verifyGoogleToken(idToken.trim());
    const rows = await this.dataSource.query<any[]>(
      `SELECT u.id, u.first_name, u.email, u.is_blocked, u.google_id,
              (c.password IS NOT NULL) AS has_password
       FROM users u
       LEFT JOIN auth_credentials c ON c.user_id = u.id
       WHERE LOWER(u.email) = LOWER($1) AND u.deleted_at IS NULL
       LIMIT 1`,
      [google.email],
    );
    const row = rows[0];
    if (!row) {
      throw new NotFoundException(
        `No hay una cuenta de Chamba con ${google.email}. Elige la cuenta de Google del correo con el que te registraste.`,
      );
    }
    if (row.is_blocked) throw new ForbiddenException('Esta cuenta está bloqueada. Escríbenos a soporte.');
    if (row.google_id && row.google_id !== google.googleId) {
      throw new ForbiddenException('Esta cuenta está vinculada a otra cuenta de Google.');
    }
    return {
      resetToken: this.access.issuePasswordReset(row.id, google.googleId),
      email: row.email,
      firstName: row.first_name,
      hadPassword: row.has_password === true,
    };
  }

  async completeGooglePasswordReset(resetToken: string, newPassword: string) {
    const claims = this.access.verifyPasswordReset(resetToken);
    const password = newPassword?.trim() ?? '';
    if (password.length < 8) {
      throw new BadRequestException('La contraseña debe tener al menos 8 caracteres.');
    }
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new BadRequestException('La contraseña es demasiado larga.');
    }
    const rows = await this.dataSource.query<any[]>(
      `SELECT id, is_blocked, google_id, tokens_valid_after FROM users
       WHERE id = $1 AND deleted_at IS NULL`,
      [claims.sub],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Cuenta no encontrada');
    if (row.is_blocked) throw new ForbiddenException('Esta cuenta está bloqueada. Escríbenos a soporte.');
    // De un solo uso: al guardar la contraseña se cierran las sesiones, y un
    // token emitido antes de eso ya no sirve.
    if (issuedBeforeRevocation(claims.iat, row.tokens_valid_after)) {
      throw new UnauthorizedException('La recuperación venció. Vuelve a empezar con Google.');
    }
    if (row.google_id && row.google_id !== claims.gid) {
      throw new ForbiddenException('Esta cuenta está vinculada a otra cuenta de Google.');
    }
    const hash = await bcrypt.hash(password, 12);
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO auth_credentials (user_id, password) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET password = EXCLUDED.password`,
        [row.id, hash],
      );
      await manager.query(
        `UPDATE users SET google_id = COALESCE(google_id, $2), tokens_valid_after = $3,
           updated_at = NOW()
         WHERE id = $1`,
        [row.id, claims.gid, new Date()],
      );
    }).catch((error) => {
      if (error?.code === '23505') {
        throw new ConflictException('Esa cuenta de Google ya está vinculada a otra cuenta de Chamba.');
      }
      throw error;
    });
    await this.loginAttempts?.reset('mobile', `user:${row.id}`);
    this.logger.log(`Cuenta ${row.id}: contraseña nueva creada con Google`);
    return this.sessionPayload(row.id);
  }

  /** Mismo formato que la respuesta de login, para dejar a la persona adentro. */
  private async sessionPayload(userId: string) {
    const rows = await this.dataSource.query<any[]>(
      `SELECT id, type, first_name, last_name, email, phone, profile_photo_url,
              verification_status, id_photo_url, face_photo_url, id_photo_verified,
              face_photo_verified, is_blocked, is_agency_worker, agency_id, is_available
       FROM users WHERE id = $1`,
      [userId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Cuenta no encontrada');
    return {
      user: {
        id: row.id,
        type: row.type,
        firstName: row.first_name,
        lastName: row.last_name ?? null,
        email: row.email,
        phone: row.phone ?? null,
        profilePhotoUrl: row.profile_photo_url ?? null,
        verificationStatus: row.verification_status ?? 'not_verified',
        idPhotoUrl: row.id_photo_url ?? null,
        facePhotoUrl: row.face_photo_url ?? null,
        idPhotoVerified: row.id_photo_verified,
        facePhotoVerified: row.face_photo_verified,
        isBlocked: row.is_blocked,
        isAgencyWorker: row.is_agency_worker ?? false,
        agencyId: row.agency_id ?? null,
        isAvailable: Boolean(row.is_available),
      },
      token: this.access.issueMobile(row.id, row.type),
    };
  }

  async googleRegister(params: {
    registrationToken: string;
    email: string;
    firstName: string;
    lastName?: string;
    googleId: string;
    type: 'worker' | 'client';
    phone?: string;
    countryCode?: string;
    phoneIdToken?: string;
  }) {
    const verified = this.access.verifyGoogleRegistration(params.registrationToken);
    const proof = await this.phoneVerification.verify(params);
    if (!['client', 'worker'].includes(params.type)) throw new BadRequestException('Tipo inválido');
    params = { ...params, email: verified.email, googleId: verified.googleId,
      firstName: verified.firstName, lastName: verified.lastName };
    const existingRows = await this.dataSource.query<any[]>(
      `SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR google_id = $2
        OR ($3::text IS NOT NULL AND (phone_e164=$3 OR regexp_replace(COALESCE(phone,''),'[^0-9]+','','g')
          IN (replace($3,'+',''),$4))) LIMIT 1`,
      [params.email, params.googleId, proof?.e164 ?? null, this.geoHelpers.normalizePhone(proof?.e164)],
    );

    if (existingRows[0]) {
      throw new ConflictException('Usuario ya existe');
    }

    return await this.dataSource.transaction(async (manager) => {
      const createdRows = await manager.query<any[]>(
        `
        INSERT INTO users (
          type, email, first_name, last_name, is_available, google_id, phone, phone_e164, firebase_phone_uid, phone_verified_at, country_code
        )
        VALUES ($1, $2, $3, $4, false, $5, $6, $7::text, $8, CASE WHEN $7::text IS NOT NULL THEN now() ELSE NULL END, $9)
        RETURNING id, type, first_name, last_name, email, phone, profile_photo_url,
                  verification_status, id_photo_url, face_photo_url,
                  id_photo_verified, face_photo_verified, is_blocked, is_available
        `,
        [
          params.type,
          params.email,
          params.firstName,
          params.lastName ?? null,
          params.googleId,
          this.geoHelpers.normalizePhone(proof?.e164 ?? params.phone),
          proof?.e164 ?? null,
          proof?.uid ?? null,
          proof?.e164.startsWith('+591') ? '+591' : params.countryCode ?? null,
        ],
      );

      const row = createdRows[0];

      await manager.query(
        `INSERT INTO auth_credentials (user_id, password) VALUES ($1, NULL)`,
        [row.id],
      );

      return {
        user: {
          id: row.id,
          type: row.type,
          firstName: row.first_name,
          lastName: row.last_name ?? null,
          email: row.email,
          phone: row.phone ?? null,
          profilePhotoUrl: row.profile_photo_url ?? null,
          verificationStatus: row.verification_status ?? 'not_verified',
          idPhotoUrl: row.id_photo_url ?? null,
          facePhotoUrl: row.face_photo_url ?? null,
          idPhotoVerified: row.id_photo_verified,
          facePhotoVerified: row.face_photo_verified,
          isBlocked: row.is_blocked,
          isAvailable: Boolean(row.is_available),
        },
        token: this.access.issueMobile(row.id, row.type),
      };
    }).catch(error => {
      if (error?.code === '23505') throw new ConflictException('El correo o teléfono ya está registrado.');
      throw error;
    });
  }

  async revokePushToken(userId: string, token: string) {
    await this.dataSource.query('DELETE FROM push_tokens WHERE user_id = $1 AND token = $2', [userId, token]);
    return { revoked: true };
  }

  async checkIdentifier(identifier: string) {
    const normalized = identifier?.trim();
    if (!normalized) {
      throw new BadRequestException('identifier is required');
    }

    const normalizedEmail = normalized.toLowerCase();
    const normalizedPhone = this.geoHelpers.normalizePhone(normalized);

    const rows = await this.dataSource.query<any[]>(
      `
      SELECT id
      FROM users
      WHERE LOWER(email) = LOWER($1)
         OR (
           $2::text IS NOT NULL
           AND regexp_replace(COALESCE(phone, ''), '[^0-9]+', '', 'g') = $2
         )
      LIMIT 1
      `,
      [normalizedEmail, normalizedPhone],
    );

    return {
      exists: Boolean(rows[0]),
    };
  }

  async getExploreData(params: {
    userId: string;
    latitude?: number;
    longitude?: number;
    radiusKm?: number;
  }) {
    return this.requestsService.getExploreData(params);
  }

  async previewRequestCategories(input: {
    title?: string;
    description: string;
    category?: string;
  }) {
    return this.requestsService.previewRequestCategories(input);
  }

  async createRequest(input: CreateRequestInput) {
    return this.requestsService.createRequest({
      ...input,
      photos: this.resolveRequestPhotos(input.clientUserId, input.photos),
    });
  }

  /**
   * Fotos que la app ya subió para la solicitud. Solo queda como nuestra (y
   * se puede borrar después) la que subió el backend para este cliente,
   * probado con su comprobante. Las versiones viejas de la app suben directo
   * a Cloudinary: se acepta la URL si es de la cuenta de Chamba, pero sin
   * publicId, así nunca se borra una imagen que no sabemos de quién es.
   */
  private resolveRequestPhotos(
    clientUserId: string,
    photos?: CreateRequestInput['photos'],
  ): Array<{ url: string; publicId: string | null }> {
    return (photos ?? []).map((photo) => {
      const ticket = this.access.verifyUploadTicket(photo?.uploadToken, clientUserId);
      if (ticket) return { url: ticket.url, publicId: ticket.publicId };
      const url = photo?.url?.trim();
      if (url && this.storageService.isOwnImageUrl(url)) return { url, publicId: null };
      throw new BadRequestException('Una de las fotos no es válida. Vuelve a subirla.');
    });
  }

  async uploadProfilePhoto(params: {
    userId: string;
    imageBase64?: string;
    imageUrl?: string;
    imagePublicId?: string;
  }) {
    return this.usersService.uploadProfilePhoto(params);
  }

  async removeProfilePhoto(userId: string) {
    return this.usersService.removeProfilePhoto(userId);
  }

  async submitWorkerVerification(params: {
    workerUserId: string;
    idPhotoBase64: string;
    facePhotoBase64: string;
  }) {
    return this.usersService.submitWorkerVerification(params);
  }

  async deleteRequestPhoto(params: {
    requestPhotoId: string;
    clientUserId: string;
  }) {
    return this.requestsService.deleteRequestPhoto(params);
  }

  async upsertPushToken(params: {
    userId: string;
    token: string;
    platform?: string;
  }) {
    return this.usersService.upsertPushToken(params);
  }

  async getRequestStatus(params: {
    requestId?: string;
    clientUserId?: string;
  }) {
    return this.requestsService.getRequestStatus(params);
  }

  async getOffers(params: { requestId?: string; clientUserId?: string }) {
    return this.offersService.getOffers(params);
  }

  async getWorkerProfile(workerId: string) {
    return this.usersService.getWorkerProfile(workerId);
  }

  async getMessages(userId: string) {
    return this.chatService.getMessages(userId);
  }

  async getThreadMessages(
    threadId: string,
    opts: { userId: string; limit?: number; before?: string },
  ) {
    return this.chatService.getThreadMessages(threadId, opts);
  }

  async archiveThread(params: { threadId: string; userId: string }) {
    return this.chatService.archiveThread(params);
  }

  async deleteThread(params: { threadId: string; userId: string }) {
    return this.chatService.deleteThread(params);
  }

  async markThreadRead(threadId: string, userId: string) {
    return this.chatService.markThreadRead(threadId, userId);
  }

  async broadcastNotification(payload: {
    target: 'all' | 'workers' | 'clients' | 'custom';
    type: 'push' | 'toast';
    title: string;
    body: string;
    toastType?: 'info' | 'success' | 'error';
    userIds?: string[];
    isCallAlert?: boolean;
  }) {
    return this.adminService.broadcastNotification(payload);
  }

  async simulateJobRequestNotification(payload: {
    target: 'all' | 'workers' | 'custom';
    userIds?: string[];
  }) {
    return this.adminService.simulateJobRequestNotification(payload);
  }

  async getPushUsers() {
    return this.adminService.getPushUsers();
  }

  async sendMessage(params: {
    threadId: string;
    senderUserId: string;
    content: string;
  }) {
    return this.chatService.sendMessage(params);
  }

  async sendChatPhoto(params: { threadId: string; senderUserId: string; imageBase64: string; caption?: string }) {
    return this.chatService.sendPhoto(params);
  }

  async getIncomingRequest(workerUserId: string) {
    return this.requestsService.getIncomingRequest(workerUserId);
  }

  async blockUser(blockerUserId: string, blockedUserId: string) {
    return this.requestsService.blockUser(blockerUserId, blockedUserId);
  }

  async listBlockedUsers(blockerUserId: string) {
    return this.requestsService.listBlockedUsers(blockerUserId);
  }

  async unblockUser(blockerUserId: string, blockedUserId: string) {
    return this.requestsService.unblockUser(blockerUserId, blockedUserId);
  }

  async reportRequest(
    requestId: string,
    reporterUserId: string,
    reason: string,
  ) {
    return this.requestsService.reportRequest(
      requestId,
      reporterUserId,
      reason,
    );
  }

  async dismissRequest(requestId: string, workerUserId: string) {
    return this.requestsService.dismissRequest(requestId, workerUserId);
  }

  async upsertOffer(params: {
    requestId: string;
    workerUserId: string;
    amount: number;
    message?: string;
  }) {
    return this.offersService.upsertOffer(params);
  }

  async acceptOffer(params: { offerId: string; clientUserId: string }) {
    return this.offersService.acceptOffer(params);
  }

  async discardOffer(params: { requestId: string; workerUserId: string }) {
    return this.offersService.discardOffer(params);
  }

  async declineOffer(params: { requestId: string; workerUserId: string }) {
    return this.offersService.declineOffer(params);
  }

  async reactivateOffer(params: { requestId: string; workerUserId: string }) {
    return this.offersService.reactivateOffer(params);
  }

  async clientCounterOffer(params: {
    requestId: string;
    clientUserId: string;
    amount: number;
  }) {
    return this.offersService.clientCounterOffer(params);
  }

  async getTracking(requestId: string) {
    return this.requestsService.getTracking(requestId);
  }

  async workerMarkArrived(params: { requestId: string; workerUserId: string }) {
    return this.requestsService.workerMarkArrived(params);
  }

  async clientConfirmArrival(params: {
    requestId: string;
    clientUserId: string;
  }) {
    return this.requestsService.clientConfirmArrival(params);
  }

  async completeJob(params: { requestId: string; workerUserId: string }) {
    return this.requestsService.completeJob(params);
  }

  async setWorkPaused(params: { requestId: string; clientUserId: string; paused: boolean }) {
    return this.requestsService.setWorkPaused(params);
  }

  async uploadRequestPhoto(clientUserId: string, imageBase64: string) {
    const images = this.geoHelpers.validateBase64Images([imageBase64], 1);
    if (!images[0]) throw new BadRequestException('Selecciona una imagen válida');
    const uploaded = await this.storageService.uploadBase64Image({ base64Data: images[0], folder: 'chamba/requests' });
    // Con el comprobante, createRequest sabe que esta foto la subió el
    // backend para este cliente (y que puede borrarla si la quita).
    return {
      ...uploaded,
      uploadToken: this.access.issueUploadTicket(clientUserId, uploaded.publicId, uploaded.url),
    };
  }

  async cancelJob(params: { requestId: string; userId: string }) {
    return this.requestsService.cancelJob(params);
  }

  async getWorkerRadar(workerUserId: string) {
    return this.requestsService.getWorkerRadar(workerUserId);
  }

  async getAdminMapSnapshot(params: { since?: string }) {
    return this.adminService.getAdminMapSnapshot(params);
  }

  async getAdminWallet(params: { period?: 'day' | 'week' | 'month' }) {
    return this.adminService.getAdminWallet(params);
  }

  async setWorkerAvailability(workerUserId: string, available: boolean) {
    return this.usersService.setWorkerAvailability(workerUserId, available);
  }

  async updateWorkerLocation(params: {
    workerUserId: string;
    latitude: number;
    longitude: number;
  }) {
    return this.usersService.updateWorkerLocation(params);
  }

  async updateClientLocation(params: {
    clientUserId: string;
    latitude: number;
    longitude: number;
  }) {
    return this.usersService.updateClientLocation(params);
  }

  async getWorkerSkills(workerUserId: string) {
    return this.usersService.getWorkerSkills(workerUserId);
  }

  async listCategories() {
    return this.catalogService.listCategories();
  }

  async createCategory(input: {
    id?: string;
    name: string;
    description?: string;
    icon?: string;
    parentId?: string;
    active?: boolean;
  }, createOnly = true) {
    return this.catalogService.createCategory(createOnly ? { name: input.name, createOnly: true } : input);
  }

  async updateWorkerSkills(workerUserId: string, skills: string[]) {
    return this.usersService.updateWorkerSkills(workerUserId, skills);
  }

  async getWorkerModalities(workerUserId: string) {
    return this.usersService.getWorkerModalities(workerUserId);
  }

  async updateWorkerModalities(
    workerUserId: string,
    input: {
      modalities?: string[];
      hourlyRate?: number | null;
      dailyRate?: number | null;
    },
  ) {
    return this.usersService.updateWorkerModalities(workerUserId, input);
  }

  async getWorkerHistory(workerUserId: string) {
    return this.usersService.getWorkerHistory(workerUserId);
  }

  async getClientHistory(clientUserId: string) {
    return this.usersService.getClientHistory(clientUserId);
  }

  async createReview(params: {
    requestId: string;
    workerUserId: string;
    clientUserId: string;
    stars: number;
    comment?: string;
  }) {
    return this.requestsService.createReview(params);
  }

  /**
   * Solo datos de catálogo y configuración que la app necesita para arrancar en
   * una base vacía. Nunca usuarios: este backend corre en producción y las
   * cuentas demo con contraseña conocida quedaban expuestas en el repo público.
   */
  private async seedBaseData(): Promise<void> {
    await this.seedDefaultConfig();
    await this.seedDefaultCategories();
  }

  private async seedDefaultCategories() {
    const defaults = [
      {
        id: 'construccion',
        name: 'Construccion',
        description: 'Albanileria, techos, pisos, demolicion',
      },
      {
        id: 'electricidad',
        name: 'Electricidad',
        description: 'Instalaciones domesticas e industriales',
      },
      {
        id: 'plomeria',
        name: 'Plomeria',
        description: 'Tuberias, fugas y sanitarios',
      },
      {
        id: 'jardineria',
        name: 'Jardineria',
        description: 'Poda, riego y mantenimiento de jardines',
      },
      {
        id: 'transporte',
        name: 'Transporte',
        description: 'Chofer, mudanzas y mensajeria',
      },
      {
        id: 'limpieza',
        name: 'Limpieza',
        description: 'Hogares, oficinas y post-obra',
      },
      {
        id: 'mecanica',
        name: 'Mecanica',
        description: 'Mecanica y mantenimiento automotriz',
      },
      {
        id: 'carpinteria',
        name: 'Carpinteria',
        description: 'Muebles, puertas y ventanas',
      },
      {
        id: 'pintura',
        name: 'Pintura',
        description: 'Pintura interior y exterior',
      },
      {
        id: 'trabajo_general',
        name: 'General',
        description: 'Ayudante general y tareas varias',
      },
    ];

    // Solo crea las que faltan: si el admin renombró o desactivó una categoría,
    // reiniciar el backend no debe deshacer ese cambio.
    for (const category of defaults) {
      await this.dataSource.query(
        `
        INSERT INTO categories (id, name, description, is_active)
        VALUES ($1, $2, $3, true)
        ON CONFLICT (id) DO NOTHING
        `,
        [category.id, category.name, category.description],
      );
    }
  }

  private async seedDefaultConfig() {
    await this.dataSource.query(
      `
      INSERT INTO app_config (key, value_json, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (key) DO NOTHING
      `,
      [
        MobileService.OFFER_LIFETIME_CONFIG_KEY,
        JSON.stringify({
          fixed: 120,
          hour: 180,
          day: 300,
        }),
      ],
    );

    await this.dataSource.query(
      `
      INSERT INTO app_config (key, value_json, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (key) DO NOTHING
      `,
      [
        MobileService.WORKER_NOTIFICATION_RADIUS_CONFIG_KEY,
        JSON.stringify({
          radiusKm: 5,
        }),
      ],
    );
  }

  async getAdminWorkerNotificationSettings() {
    return this.adminService.getAdminWorkerNotificationSettings();
  }

  async updateAdminWorkerNotificationSettings(params: { radiusKm: number }) {
    return this.adminService.updateAdminWorkerNotificationSettings(params);
  }

  async getOfferLifetimeSettings() {
    return this.adminService.getOfferLifetimeSettings();
  }

  async updateOfferLifetimeSettings(params: {
    fixed: number;
    hour: number;
    day: number;
  }) {
    return this.adminService.updateOfferLifetimeSettings(params);
  }

  async getRequestTimeoutSettings() {
    return this.adminService.getRequestTimeoutSettings();
  }

  async updateRequestTimeoutSettings(
    params: Record<
      string,
      {
        timeoutMinutes?: number;
        reminder1Minutes?: number;
        reminder2Minutes?: number;
      }
    >,
  ) {
    return this.adminService.updateRequestTimeoutSettings(params);
  }

  async getRequestNotifiedWorkers(requestId: string) {
    return this.adminService.getRequestNotifiedWorkers(requestId);
  }

  async getRequestDetail(requestId: string) {
    return this.adminService.getRequestDetail(requestId);
  }

  async listDisputes(params?: { status?: string }) {
    return this.disputesService.listDisputes(params);
  }

  async createDispute(params: {
    requestId?: string;
    reportedBy: string;
    reportedUser?: string;
    reason: string;
    description?: string;
  }) {
    return this.disputesService.createDispute(params);
  }

  async resolveDispute(params: {
    disputeId: string;
    resolution: string;
    resolvedBy: string;
  }) {
    return this.disputesService.resolveDispute(params);
  }

  async adminCancelJob(params: { requestId: string }) {
    return this.adminService.adminCancelJob(params);
  }

  async getCancellationStats() {
    return this.adminService.getCancellationStats();
  }

  async getCommissionConfig() {
    return this.adminService.getCommissionConfig();
  }

  async updateCommissionConfig(params: { commissionPercent: number }) {
    return this.adminService.updateCommissionConfig(params);
  }

  async getAiConfig() {
    return this.adminService.getAiConfig();
  }

  async testAiMessage(message: string) {
    return this.adminService.testAiMessage(message);
  }

  async checkAiStatus() {
    return this.adminService.checkAiStatus();
  }

  async updateAiConfig(params: {
    activeProvider: string;
    geminiKey: string;
    nvidiaKey: string;
    nvidiaModel: string;
    deepseekKey: string;
  }) {
    return this.adminService.updateAiConfig(params);
  }

  async getStripeConfig() {
    return this.adminService.getStripeConfig();
  }

  async updateStripeConfig(params: {
    active: boolean;
    publishableKey: string;
    secretKey: string;
  }) {
    return this.adminService.updateStripeConfig(params);
  }

  async updateCategory(params: {
    id: string;
    name?: string;
    description?: string;
    icon?: string;
    active?: boolean;
  }) {
    return this.catalogService.updateCategory(params);
  }

  async getDisputeMessages(disputeId: string, readBy?: string) {
    return this.disputesService.getDisputeMessages(disputeId, readBy);
  }

  async getUserActiveDisputes(userId: string) {
    return this.disputesService.getUserActiveDisputes(userId);
  }

  async sendDisputeMessage(params: {
    disputeId: string;
    senderType: string;
    senderId?: string;
    content: string;
  }) {
    return this.disputesService.sendDisputeMessage(params);
  }

  async deleteCategory(categoryId: string) {
    return this.catalogService.deleteCategory(categoryId);
  }

  async listAllCategories() {
    return this.catalogService.listAllCategories();
  }

  async getUserDisputes(userId: string) {
    return this.disputesService.getUserDisputes(userId);
  }
}
