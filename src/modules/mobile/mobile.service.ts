import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
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
    url: string;
    publicId: string;
  }>;
  paymentMethod?: string;
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
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSchema();
    await this.seedData();
  }

  async register(input: {
    type?: string;
    email: string;
    phone?: string;
    firstName: string;
    lastName?: string;
    password: string;
    ciNumber?: string;
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

    const phone = this.geoHelpers.normalizePhone(input.phone);
    const lastName = input.lastName?.trim() || null;

    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.query<any[]>(
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
        [email, phone],
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
          ci_number
        )
        VALUES ($1, $2, $3, $4, $5, false, $6)
        RETURNING id, type, first_name, last_name, email, phone, profile_photo_url,
                  verification_status, id_photo_url, face_photo_url,
                  id_photo_verified, face_photo_verified
        `,
        [type, email, phone, firstName, lastName, ciNumber],
      );

      const created = createdRows[0];
      await manager.query(
        `
        INSERT INTO auth_credentials (user_id, password)
        VALUES ($1, $2)
        `,
        [created.id, password],
      );

      return {
        user: {
          id: created.id,
          type: created.type,
          firstName: created.first_name,
          lastName: created.last_name ?? null,
          email: created.email,
          phone: created.phone ?? null,
          profilePhotoUrl: created.profile_photo_url ?? null,
          verificationStatus: created.verification_status ?? 'not_verified',
          idPhotoUrl: created.id_photo_url ?? null,
          facePhotoUrl: created.face_photo_url ?? null,
          idPhotoVerified: created.id_photo_verified ?? null,
          facePhotoVerified: created.face_photo_verified ?? null,
        },
      };
    });
  }

  async login(identifier: string, password: string) {
    if (!identifier?.trim() || !password?.trim()) {
      throw new BadRequestException('identifier and password are required');
    }

    const normalizedEmail = identifier.trim().toLowerCase();
    const normalizedPhone = this.geoHelpers.normalizePhone(identifier);

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
             u.agency_id
      FROM users u
      JOIN auth_credentials c ON c.user_id = u.id
      WHERE (
          LOWER(u.email) = LOWER($1)
          OR (
            $2::text IS NOT NULL
            AND regexp_replace(COALESCE(u.phone, ''), '[^0-9]+', '', 'g') = $2
          )
        )
        AND c.password = $3
      LIMIT 1
      `,
      [normalizedEmail, normalizedPhone, password.trim()],
    );

    const row = rows[0];
    if (!row) {
      throw new UnauthorizedException('Credenciales invalidas');
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
        isAgencyWorker: row.is_agency_worker ?? false,
        agencyId: row.agency_id ?? null,
      },
      token: 'fake-jwt-token-for-now',
    };
  }

  private async verifyGoogleToken(idToken: string) {
    let response: Response;
    try {
      response = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`,
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
             u.google_id
      FROM users u
      WHERE LOWER(u.email) = LOWER($1) OR u.google_id = $2
      LIMIT 1
      `,
      [googleData.email, googleData.googleId],
    );

    const row = rows[0];

    if (!row) {
      return {
        requiresRegistration: true,
        googleData,
      };
    }

    if (!row.google_id) {
      await this.dataSource.query(
        `UPDATE users SET google_id = $1 WHERE id = $2`,
        [googleData.googleId, row.id],
      );
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
      },
      token: 'fake-jwt-token-for-now',
    };
  }

  async googleRegister(params: {
    email: string;
    firstName: string;
    lastName?: string;
    googleId: string;
    type: 'worker' | 'client';
  }) {
    const existingRows = await this.dataSource.query<any[]>(
      `SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR google_id = $2 LIMIT 1`,
      [params.email, params.googleId],
    );

    if (existingRows[0]) {
      throw new ConflictException('Usuario ya existe');
    }

    return await this.dataSource.transaction(async (manager) => {
      const createdRows = await manager.query<any[]>(
        `
        INSERT INTO users (
          type, email, first_name, last_name, is_available, google_id
        )
        VALUES ($1, $2, $3, $4, false, $5)
        RETURNING id, type, first_name, last_name, email, phone, profile_photo_url,
                  verification_status, id_photo_url, face_photo_url,
                  id_photo_verified, face_photo_verified, is_blocked
        `,
        [
          params.type,
          params.email,
          params.firstName,
          params.lastName ?? null,
          params.googleId,
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
        },
        token: 'fake-jwt-token-for-now',
      };
    });
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
    return this.requestsService.createRequest(input);
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
    opts?: { limit?: number; before?: string },
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
  }) {
    return this.adminService.broadcastNotification(payload);
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

  async getIncomingRequest(workerUserId: string) {
    return this.requestsService.getIncomingRequest(workerUserId);
  }

  async blockUser(blockerUserId: string, blockedUserId: string) {
    return this.requestsService.blockUser(blockerUserId, blockedUserId);
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
  }) {
    return this.catalogService.createCategory(input);
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

  private async ensureSchema(): Promise<void> {
    // Schema is managed by TypeORM migrations (database.module.ts → migrationsRun: true).
  }

  private async seedData(): Promise<void> {
    await this.seedDefaultConfig();
    await this.seedDefaultCategories();

    const demoUsers = [
      {
        type: 'client',
        email: 'cliente.demo@chamba.app',
        phone: '+59170000001',
        firstName: 'Carla',
        lastName: 'Mendoza',
        profilePhotoUrl:
          'https://images.unsplash.com/photo-1494790108377-be9c29b29330',
        latitude: -16.5002,
        longitude: -68.1342,
        isAvailable: false,
        workRadiusKm: 5,
        averageRating: 0,
        completedJobs: 0,
        skills: [] as string[],
      },
      {
        type: 'worker',
        email: 'worker.roberto@chamba.app',
        phone: '+59170000011',
        firstName: 'Roberto',
        lastName: 'Gomez',
        profilePhotoUrl:
          'https://images.unsplash.com/photo-1500648767791-00dcc994a43e',
        latitude: -16.4965,
        longitude: -68.129,
        isAvailable: true,
        workRadiusKm: 8,
        averageRating: 4.9,
        completedJobs: 124,
        skills: ['Pintura', 'Construccion', 'Acabados'],
      },
      {
        type: 'worker',
        email: 'worker.elena@chamba.app',
        phone: '+59170000012',
        firstName: 'Elena',
        lastName: 'Morales',
        profilePhotoUrl:
          'https://images.unsplash.com/photo-1500917293891-ef795e70e1f6',
        latitude: -16.491,
        longitude: -68.122,
        isAvailable: true,
        workRadiusKm: 7,
        averageRating: 4.8,
        completedJobs: 86,
        skills: ['Pintura', 'Decoracion'],
      },
      {
        type: 'worker',
        email: 'worker.marcos@chamba.app',
        phone: '+59170000013',
        firstName: 'Marcos',
        lastName: 'Quispe',
        profilePhotoUrl:
          'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d',
        latitude: -16.506,
        longitude: -68.139,
        isAvailable: true,
        workRadiusKm: 10,
        averageRating: 4.7,
        completedJobs: 210,
        skills: ['Pintura', 'Plomeria', 'Electricidad'],
      },
    ];

    const userIdsByEmail = new Map<string, string>();
    for (const demoUser of demoUsers) {
      const rows = await this.dataSource.query<any[]>(
        `
        INSERT INTO users (
          type,
          email,
          phone,
          first_name,
          last_name,
          profile_photo_url,
          current_location,
          work_radius_km,
          average_rating,
          completed_jobs,
          is_available
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          ST_SetSRID(ST_MakePoint($8::float8, $7::float8), 4326)::geography,
          $9,
          $10,
          $11,
          $12
        )
        ON CONFLICT (email)
        DO UPDATE SET
          type = EXCLUDED.type,
          phone = EXCLUDED.phone,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          profile_photo_url = EXCLUDED.profile_photo_url,
          current_location = EXCLUDED.current_location,
          work_radius_km = EXCLUDED.work_radius_km,
          average_rating = EXCLUDED.average_rating,
          completed_jobs = EXCLUDED.completed_jobs,
          is_available = EXCLUDED.is_available,
          updated_at = NOW()
        RETURNING id
        `,
        [
          demoUser.type,
          demoUser.email,
          demoUser.phone,
          demoUser.firstName,
          demoUser.lastName,
          demoUser.profilePhotoUrl,
          demoUser.latitude,
          demoUser.longitude,
          demoUser.workRadiusKm,
          demoUser.averageRating,
          demoUser.completedJobs,
          demoUser.isAvailable,
        ],
      );

      const userId = rows[0]?.id;
      if (!userId) {
        continue;
      }

      userIdsByEmail.set(demoUser.email, userId);

      await this.dataSource.query(
        `
        INSERT INTO auth_credentials (user_id, password)
        VALUES ($1, '123456')
        ON CONFLICT (user_id) DO UPDATE SET password = EXCLUDED.password
        `,
        [userId],
      );

      if (demoUser.type === 'worker') {
        await this.dataSource.query(
          `DELETE FROM worker_skills WHERE user_id = $1`,
          [userId],
        );
        for (const skill of demoUser.skills) {
          await this.dataSource.query(
            `INSERT INTO worker_skills (user_id, skill) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [userId, skill],
          );
        }
      }
    }

    const countRows = await this.dataSource.query<any[]>(
      `SELECT COUNT(*)::text AS count FROM job_requests`,
    );
    if (Number(countRows[0]?.count ?? 0) > 0) {
      return;
    }

    const clientId = userIdsByEmail.get('cliente.demo@chamba.app');
    if (!clientId) {
      return;
    }

    const created = await this.createRequest({
      clientUserId: clientId,
      title: 'Pintado de fachada exterior',
      description:
        'Necesito pintor con experiencia para retoques en fachada de vivienda unifamiliar.',
      category: 'Pintura',
      budget: 100,
      priceType: 'Por dia',
      address: 'Av. Arce, Edificio Multicine',
      latitude: -16.502,
      longitude: -68.132,
      scheduledAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
    });

    const offers = await this.getOffers({ requestId: created.request.id });
    const firstOffer = offers.offers[0];

    if (firstOffer) {
      await this.acceptOffer({
        offerId: firstOffer.id,
        clientUserId: clientId,
      });
    }
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

    for (const category of defaults) {
      await this.dataSource.query(
        `
        INSERT INTO categories (id, name, description, is_active)
        VALUES ($1, $2, $3, true)
        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          is_active = true,
          updated_at = NOW()
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
