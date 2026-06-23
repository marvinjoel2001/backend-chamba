"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var MobileService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MobileService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("typeorm");
const storage_service_1 = require("../../infrastructure/storage/storage.service");
const notifications_service_1 = require("../notifications/notifications.service");
const realtime_gateway_1 = require("../realtime/realtime.gateway");
const mobile_request_repository_1 = require("./shared/mobile-request.repository");
const mobile_geo_helpers_1 = require("./shared/mobile-geo.helpers");
const mobile_catalog_service_1 = require("./services/mobile-catalog.service");
const mobile_chat_service_1 = require("./services/mobile-chat.service");
const mobile_disputes_service_1 = require("./services/mobile-disputes.service");
const mobile_offers_service_1 = require("./services/mobile-offers.service");
const mobile_requests_service_1 = require("./services/mobile-requests.service");
const mobile_users_service_1 = require("./services/mobile-users.service");
const mobile_admin_service_1 = require("./services/mobile-admin.service");
let MobileService = class MobileService {
    static { MobileService_1 = this; }
    configService;
    dataSource;
    storageService;
    notificationsService;
    realtimeGateway;
    repo;
    geoHelpers;
    catalogService;
    chatService;
    disputesService;
    offersService;
    requestsService;
    usersService;
    adminService;
    logger = new common_1.Logger(MobileService_1.name);
    static OFFER_LIFETIME_SECONDS = 120;
    static OFFER_LIFETIME_CONFIG_KEY = 'offer_lifetime_by_price_type';
    static WORKER_NOTIFICATION_RADIUS_CONFIG_KEY = 'worker_notification_radius_km';
    static WORKER_NOTIFICATION_WAVE_SIZE = 5;
    static WORKER_NOTIFICATION_WAVE_DELAY_MS = 7000;
    static DEFAULT_CATEGORY = 'General';
    static GEMINI_TIMEOUT_MS = 25000;
    constructor(configService, dataSource, storageService, notificationsService, realtimeGateway, repo, geoHelpers, catalogService, chatService, disputesService, offersService, requestsService, usersService, adminService) {
        this.configService = configService;
        this.dataSource = dataSource;
        this.storageService = storageService;
        this.notificationsService = notificationsService;
        this.realtimeGateway = realtimeGateway;
        this.repo = repo;
        this.geoHelpers = geoHelpers;
        this.catalogService = catalogService;
        this.chatService = chatService;
        this.disputesService = disputesService;
        this.offersService = offersService;
        this.requestsService = requestsService;
        this.usersService = usersService;
        this.adminService = adminService;
    }
    async onModuleInit() {
        await this.ensureSchema();
        await this.seedData();
    }
    async register(input) {
        const type = (input.type ?? 'client').toLowerCase().trim();
        if (type !== 'client' && type !== 'worker') {
            throw new common_1.BadRequestException('type must be client or worker');
        }
        const email = input.email?.trim().toLowerCase();
        if (!email) {
            throw new common_1.BadRequestException('email is required');
        }
        const firstName = input.firstName?.trim();
        if (!firstName) {
            throw new common_1.BadRequestException('firstName is required');
        }
        const password = input.password?.trim();
        if (!password || password.length < 4) {
            throw new common_1.BadRequestException('password must be at least 4 characters');
        }
        const phone = this.geoHelpers.normalizePhone(input.phone);
        const lastName = input.lastName?.trim() || null;
        return this.dataSource.transaction(async (manager) => {
            const existing = await manager.query(`
        SELECT id
        FROM users
        WHERE LOWER(email) = LOWER($1)
           OR (
             $2::text IS NOT NULL
             AND regexp_replace(COALESCE(phone, ''), '[^0-9]+', '', 'g') = $2
           )
        LIMIT 1
        `, [email, phone]);
            if (existing[0]) {
                throw new common_1.ConflictException('El correo o telefono ya esta registrado');
            }
            const ciNumber = input.ciNumber?.trim() || null;
            const createdRows = await manager.query(`
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
        `, [type, email, phone, firstName, lastName, ciNumber]);
            const created = createdRows[0];
            await manager.query(`
        INSERT INTO auth_credentials (user_id, password)
        VALUES ($1, $2)
        `, [created.id, password]);
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
    async login(identifier, password) {
        if (!identifier?.trim() || !password?.trim()) {
            throw new common_1.BadRequestException('identifier and password are required');
        }
        const normalizedEmail = identifier.trim().toLowerCase();
        const normalizedPhone = this.geoHelpers.normalizePhone(identifier);
        const rows = await this.dataSource.query(`
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
             u.is_blocked
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
      `, [normalizedEmail, normalizedPhone, password.trim()]);
        const row = rows[0];
        if (!row) {
            throw new common_1.UnauthorizedException('Credenciales invalidas');
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
    async verifyGoogleToken(idToken) {
        let response;
        try {
            response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
        }
        catch {
            throw new common_1.UnauthorizedException('No se pudo conectar con Google para verificar el token');
        }
        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            this.logger.warn(`[Google] tokeninfo HTTP ${response.status}: ${detail.slice(0, 200)}`);
            throw new common_1.UnauthorizedException('Token de Google invalido o expirado');
        }
        const data = await response.json();
        if (!data.email || !data.sub) {
            throw new common_1.UnauthorizedException('Token de Google no contiene email o id de usuario');
        }
        return {
            email: data.email,
            firstName: data.given_name ?? '',
            lastName: data.family_name ?? null,
            googleId: data.sub,
        };
    }
    async googleLogin(idToken) {
        const googleData = await this.verifyGoogleToken(idToken);
        const rows = await this.dataSource.query(`
      SELECT u.id, u.type, u.first_name, u.last_name, u.email, u.phone,
             u.profile_photo_url, u.verification_status, u.id_photo_url,
             u.face_photo_url, u.id_photo_verified, u.face_photo_verified, u.is_blocked,
             u.google_id
      FROM users u
      WHERE LOWER(u.email) = LOWER($1) OR u.google_id = $2
      LIMIT 1
      `, [googleData.email, googleData.googleId]);
        const row = rows[0];
        if (!row) {
            return {
                requiresRegistration: true,
                googleData,
            };
        }
        if (!row.google_id) {
            await this.dataSource.query(`UPDATE users SET google_id = $1 WHERE id = $2`, [googleData.googleId, row.id]);
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
    async googleRegister(params) {
        const existingRows = await this.dataSource.query(`SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR google_id = $2 LIMIT 1`, [params.email, params.googleId]);
        if (existingRows[0]) {
            throw new common_1.ConflictException('Usuario ya existe');
        }
        return await this.dataSource.transaction(async (manager) => {
            const createdRows = await manager.query(`
        INSERT INTO users (
          type, email, first_name, last_name, is_available, google_id
        )
        VALUES ($1, $2, $3, $4, false, $5)
        RETURNING id, type, first_name, last_name, email, phone, profile_photo_url,
                  verification_status, id_photo_url, face_photo_url,
                  id_photo_verified, face_photo_verified, is_blocked
        `, [
                params.type,
                params.email,
                params.firstName,
                params.lastName ?? null,
                params.googleId,
            ]);
            const row = createdRows[0];
            await manager.query(`INSERT INTO auth_credentials (user_id, password) VALUES ($1, NULL)`, [row.id]);
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
    async checkIdentifier(identifier) {
        const normalized = identifier?.trim();
        if (!normalized) {
            throw new common_1.BadRequestException('identifier is required');
        }
        const normalizedEmail = normalized.toLowerCase();
        const normalizedPhone = this.geoHelpers.normalizePhone(normalized);
        const rows = await this.dataSource.query(`
      SELECT id
      FROM users
      WHERE LOWER(email) = LOWER($1)
         OR (
           $2::text IS NOT NULL
           AND regexp_replace(COALESCE(phone, ''), '[^0-9]+', '', 'g') = $2
         )
      LIMIT 1
      `, [normalizedEmail, normalizedPhone]);
        return {
            exists: Boolean(rows[0]),
        };
    }
    async getExploreData(params) {
        return this.requestsService.getExploreData(params);
    }
    async previewRequestCategories(input) {
        return this.requestsService.previewRequestCategories(input);
    }
    async createRequest(input) {
        return this.requestsService.createRequest(input);
    }
    async uploadProfilePhoto(params) {
        return this.usersService.uploadProfilePhoto(params);
    }
    async removeProfilePhoto(userId) {
        return this.usersService.removeProfilePhoto(userId);
    }
    async submitWorkerVerification(params) {
        return this.usersService.submitWorkerVerification(params);
    }
    async deleteRequestPhoto(params) {
        return this.requestsService.deleteRequestPhoto(params);
    }
    async upsertPushToken(params) {
        return this.usersService.upsertPushToken(params);
    }
    async getRequestStatus(params) {
        return this.requestsService.getRequestStatus(params);
    }
    async getOffers(params) {
        return this.offersService.getOffers(params);
    }
    async getWorkerProfile(workerId) {
        return this.usersService.getWorkerProfile(workerId);
    }
    async getMessages(userId) {
        return this.chatService.getMessages(userId);
    }
    async getThreadMessages(threadId, opts) {
        return this.chatService.getThreadMessages(threadId, opts);
    }
    async archiveThread(params) {
        return this.chatService.archiveThread(params);
    }
    async broadcastNotification(payload) {
        return this.adminService.broadcastNotification(payload);
    }
    async getPushUsers() {
        return this.adminService.getPushUsers();
    }
    async sendMessage(params) {
        return this.chatService.sendMessage(params);
    }
    async getIncomingRequest(workerUserId) {
        return this.requestsService.getIncomingRequest(workerUserId);
    }
    async blockUser(blockerUserId, blockedUserId) {
        return this.requestsService.blockUser(blockerUserId, blockedUserId);
    }
    async reportRequest(requestId, reporterUserId, reason) {
        return this.requestsService.reportRequest(requestId, reporterUserId, reason);
    }
    async dismissRequest(requestId, workerUserId) {
        return this.requestsService.dismissRequest(requestId, workerUserId);
    }
    async upsertOffer(params) {
        return this.offersService.upsertOffer(params);
    }
    async acceptOffer(params) {
        return this.offersService.acceptOffer(params);
    }
    async discardOffer(params) {
        return this.offersService.discardOffer(params);
    }
    async declineOffer(params) {
        return this.offersService.declineOffer(params);
    }
    async reactivateOffer(params) {
        return this.offersService.reactivateOffer(params);
    }
    async clientCounterOffer(params) {
        return this.offersService.clientCounterOffer(params);
    }
    async getTracking(requestId) {
        return this.requestsService.getTracking(requestId);
    }
    async workerMarkArrived(params) {
        return this.requestsService.workerMarkArrived(params);
    }
    async clientConfirmArrival(params) {
        return this.requestsService.clientConfirmArrival(params);
    }
    async completeJob(params) {
        return this.requestsService.completeJob(params);
    }
    async cancelJob(params) {
        return this.requestsService.cancelJob(params);
    }
    async getWorkerRadar(workerUserId) {
        return this.requestsService.getWorkerRadar(workerUserId);
    }
    async getAdminMapSnapshot(params) {
        return this.adminService.getAdminMapSnapshot(params);
    }
    async getAdminWallet(params) {
        return this.adminService.getAdminWallet(params);
    }
    async setWorkerAvailability(workerUserId, available) {
        return this.usersService.setWorkerAvailability(workerUserId, available);
    }
    async updateWorkerLocation(params) {
        return this.usersService.updateWorkerLocation(params);
    }
    async updateClientLocation(params) {
        return this.usersService.updateClientLocation(params);
    }
    async getWorkerSkills(workerUserId) {
        return this.usersService.getWorkerSkills(workerUserId);
    }
    async listCategories() {
        return this.catalogService.listCategories();
    }
    async createCategory(input) {
        return this.catalogService.createCategory(input);
    }
    async updateWorkerSkills(workerUserId, skills) {
        return this.usersService.updateWorkerSkills(workerUserId, skills);
    }
    async getWorkerModalities(workerUserId) {
        return this.usersService.getWorkerModalities(workerUserId);
    }
    async updateWorkerModalities(workerUserId, input) {
        return this.usersService.updateWorkerModalities(workerUserId, input);
    }
    async getWorkerHistory(workerUserId) {
        return this.usersService.getWorkerHistory(workerUserId);
    }
    async getClientHistory(clientUserId) {
        return this.usersService.getClientHistory(clientUserId);
    }
    async createReview(params) {
        return this.requestsService.createReview(params);
    }
    async ensureSchema() {
    }
    async seedData() {
        await this.seedDefaultConfig();
        await this.seedDefaultCategories();
        const demoUsers = [
            {
                type: 'client',
                email: 'cliente.demo@chamba.app',
                phone: '+59170000001',
                firstName: 'Carla',
                lastName: 'Mendoza',
                profilePhotoUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330',
                latitude: -16.5002,
                longitude: -68.1342,
                isAvailable: false,
                workRadiusKm: 5,
                averageRating: 0,
                completedJobs: 0,
                skills: [],
            },
            {
                type: 'worker',
                email: 'worker.roberto@chamba.app',
                phone: '+59170000011',
                firstName: 'Roberto',
                lastName: 'Gomez',
                profilePhotoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e',
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
                profilePhotoUrl: 'https://images.unsplash.com/photo-1500917293891-ef795e70e1f6',
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
                profilePhotoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d',
                latitude: -16.506,
                longitude: -68.139,
                isAvailable: true,
                workRadiusKm: 10,
                averageRating: 4.7,
                completedJobs: 210,
                skills: ['Pintura', 'Plomeria', 'Electricidad'],
            },
        ];
        const userIdsByEmail = new Map();
        for (const demoUser of demoUsers) {
            const rows = await this.dataSource.query(`
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
        `, [
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
            ]);
            const userId = rows[0]?.id;
            if (!userId) {
                continue;
            }
            userIdsByEmail.set(demoUser.email, userId);
            await this.dataSource.query(`
        INSERT INTO auth_credentials (user_id, password)
        VALUES ($1, '123456')
        ON CONFLICT (user_id) DO UPDATE SET password = EXCLUDED.password
        `, [userId]);
            if (demoUser.type === 'worker') {
                await this.dataSource.query(`DELETE FROM worker_skills WHERE user_id = $1`, [userId]);
                for (const skill of demoUser.skills) {
                    await this.dataSource.query(`INSERT INTO worker_skills (user_id, skill) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, skill]);
                }
            }
        }
        const countRows = await this.dataSource.query(`SELECT COUNT(*)::text AS count FROM job_requests`);
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
            description: 'Necesito pintor con experiencia para retoques en fachada de vivienda unifamiliar.',
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
    async seedDefaultCategories() {
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
            await this.dataSource.query(`
        INSERT INTO categories (id, name, description, is_active)
        VALUES ($1, $2, $3, true)
        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          is_active = true,
          updated_at = NOW()
        `, [category.id, category.name, category.description]);
        }
    }
    async seedDefaultConfig() {
        await this.dataSource.query(`
      INSERT INTO app_config (key, value_json, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (key) DO NOTHING
      `, [
            MobileService_1.OFFER_LIFETIME_CONFIG_KEY,
            JSON.stringify({
                fixed: 120,
                hour: 180,
                day: 300,
            }),
        ]);
        await this.dataSource.query(`
      INSERT INTO app_config (key, value_json, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (key) DO NOTHING
      `, [
            MobileService_1.WORKER_NOTIFICATION_RADIUS_CONFIG_KEY,
            JSON.stringify({
                radiusKm: 5,
            }),
        ]);
    }
    async getAdminWorkerNotificationSettings() {
        return this.adminService.getAdminWorkerNotificationSettings();
    }
    async updateAdminWorkerNotificationSettings(params) {
        return this.adminService.updateAdminWorkerNotificationSettings(params);
    }
    async getRequestNotifiedWorkers(requestId) {
        return this.adminService.getRequestNotifiedWorkers(requestId);
    }
    async listDisputes(params) {
        return this.disputesService.listDisputes(params);
    }
    async createDispute(params) {
        return this.disputesService.createDispute(params);
    }
    async resolveDispute(params) {
        return this.disputesService.resolveDispute(params);
    }
    async adminCancelJob(params) {
        return this.adminService.adminCancelJob(params);
    }
    async getCancellationStats() {
        return this.adminService.getCancellationStats();
    }
    async getCommissionConfig() {
        return this.adminService.getCommissionConfig();
    }
    async updateCommissionConfig(params) {
        return this.adminService.updateCommissionConfig(params);
    }
    async getAiConfig() {
        return this.adminService.getAiConfig();
    }
    async testAiMessage(message) {
        return this.adminService.testAiMessage(message);
    }
    async checkAiStatus() {
        return this.adminService.checkAiStatus();
    }
    async updateAiConfig(params) {
        return this.adminService.updateAiConfig(params);
    }
    async updateCategory(params) {
        return this.catalogService.updateCategory(params);
    }
    async getDisputeMessages(disputeId, readBy) {
        return this.disputesService.getDisputeMessages(disputeId, readBy);
    }
    async getUserActiveDisputes(userId) {
        return this.disputesService.getUserActiveDisputes(userId);
    }
    async sendDisputeMessage(params) {
        return this.disputesService.sendDisputeMessage(params);
    }
    async deleteCategory(categoryId) {
        return this.catalogService.deleteCategory(categoryId);
    }
    async listAllCategories() {
        return this.catalogService.listAllCategories();
    }
    async getUserDisputes(userId) {
        return this.disputesService.getUserDisputes(userId);
    }
};
exports.MobileService = MobileService;
exports.MobileService = MobileService = MobileService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        typeorm_1.DataSource,
        storage_service_1.StorageService,
        notifications_service_1.NotificationsService,
        realtime_gateway_1.RealtimeGateway,
        mobile_request_repository_1.MobileRequestRepository,
        mobile_geo_helpers_1.MobileGeoHelpers,
        mobile_catalog_service_1.MobileCatalogService,
        mobile_chat_service_1.MobileChatService,
        mobile_disputes_service_1.MobileDisputesService,
        mobile_offers_service_1.MobileOffersService,
        mobile_requests_service_1.MobileRequestsService,
        mobile_users_service_1.MobileUsersService,
        mobile_admin_service_1.MobileAdminService])
], MobileService);
//# sourceMappingURL=mobile.service.js.map