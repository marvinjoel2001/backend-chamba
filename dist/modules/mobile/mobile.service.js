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
let MobileService = class MobileService {
    static { MobileService_1 = this; }
    configService;
    dataSource;
    storageService;
    notificationsService;
    realtimeGateway;
    logger = new common_1.Logger(MobileService_1.name);
    static OFFER_LIFETIME_SECONDS = 120;
    static OFFER_LIFETIME_CONFIG_KEY = 'offer_lifetime_by_price_type';
    static WORKER_NOTIFICATION_RADIUS_CONFIG_KEY = 'worker_notification_radius_km';
    static WORKER_NOTIFICATION_WAVE_SIZE = 5;
    static WORKER_NOTIFICATION_WAVE_DELAY_MS = 7000;
    static DEFAULT_CATEGORY = 'General';
    static GEMINI_TIMEOUT_MS = 25000;
    constructor(configService, dataSource, storageService, notificationsService, realtimeGateway) {
        this.configService = configService;
        this.dataSource = dataSource;
        this.storageService = storageService;
        this.notificationsService = notificationsService;
        this.realtimeGateway = realtimeGateway;
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
        const phone = this.normalizePhone(input.phone);
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
            const createdRows = await manager.query(`
        INSERT INTO users (
          type,
          email,
          phone,
          first_name,
          last_name,
          is_available
        )
        VALUES ($1, $2, $3, $4, $5, false)
        RETURNING id, type, first_name, last_name, email, phone, profile_photo_url,
                  verification_status, id_photo_url, face_photo_url,
                  id_photo_verified, face_photo_verified
        `, [type, email, phone, firstName, lastName]);
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
        const normalizedPhone = this.normalizePhone(identifier);
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
        try {
            const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
            if (!response.ok) {
                throw new common_1.UnauthorizedException('Token de Google invalido');
            }
            const data = await response.json();
            return {
                email: data.email,
                firstName: data.given_name,
                lastName: data.family_name,
                googleId: data.sub,
            };
        }
        catch (error) {
            throw new common_1.UnauthorizedException('Fallo al verificar el token de Google');
        }
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
        `, [params.type, params.email, params.firstName, params.lastName ?? null, params.googleId]);
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
        const normalizedPhone = this.normalizePhone(normalized);
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
        const user = await this.getUserById(params.userId);
        const radiusKm = params.radiusKm && params.radiusKm > 0 ? params.radiusKm : 8;
        const workerRows = await this.dataSource.query(`
      WITH origin AS (
        SELECT
          CASE
            WHEN $2::float8 IS NOT NULL AND $3::float8 IS NOT NULL
              THEN ST_SetSRID(ST_MakePoint($3::float8, $2::float8), 4326)::geography
            ELSE u.current_location
          END AS point
        FROM users u
        WHERE u.id = $1
      ),
      worker_skill_agg AS (
        SELECT ws.user_id, array_agg(ws.skill ORDER BY ws.skill) AS skills
        FROM worker_skills ws
        GROUP BY ws.user_id
      )
      SELECT w.id,
             w.first_name,
             w.last_name,
             w.profile_photo_url,
             w.average_rating,
             w.completed_jobs,
             w.is_available,
             w.work_radius_km,
             ST_Y(w.current_location::geometry) AS latitude,
             ST_X(w.current_location::geometry) AS longitude,
             ST_Distance(w.current_location, origin.point) / 1000.0 AS distance_km,
             sa.skills
      FROM users w
      CROSS JOIN origin
      LEFT JOIN worker_skill_agg sa ON sa.user_id = w.id
      WHERE w.type = 'worker'
        AND w.is_available = true
        AND w.current_location IS NOT NULL
        AND origin.point IS NOT NULL
        AND ST_DWithin(w.current_location, origin.point, $4::float8 * 1000)
      ORDER BY distance_km ASC
      LIMIT 30
      `, [
            params.userId,
            params.latitude ?? null,
            params.longitude ?? null,
            radiusKm,
        ]);
        const activeRequest = await this.findLatestClientRequest(user.id);
        const topCategories = this.extractTopCategories(workerRows);
        const categories = topCategories.length > 0
            ? topCategories
            : await this.listFallbackCategories();
        return {
            user,
            categories,
            activeRequest,
            nearbyWorkers: workerRows.map((row) => ({
                id: row.id,
                firstName: row.first_name,
                lastName: row.last_name ?? '',
                profilePhotoUrl: row.profile_photo_url ?? null,
                averageRating: Number(row.average_rating ?? 0),
                completedJobs: Number(row.completed_jobs ?? 0),
                isAvailable: row.is_available,
                workRadiusKm: Number(row.work_radius_km ?? 0),
                latitude: Number(row.latitude),
                longitude: Number(row.longitude),
                distanceKm: Number(row.distance_km ?? 0),
                skills: row.skills ?? [],
            })),
        };
    }
    async previewRequestCategories(input) {
        const description = input.description?.trim();
        if (!description) {
            throw new common_1.BadRequestException('description is required');
        }
        const fallbackCategory = input.category?.trim() || MobileService_1.DEFAULT_CATEGORY;
        const title = this.buildRequestTitle({
            title: input.title,
            description,
            fallbackCategory,
        });
        const aiCategories = this.normalizeAiCategories(await this.classifyRequestCategoriesWithAi({
            title,
            description,
            fallbackCategory,
        }), fallbackCategory);
        return {
            title,
            category: aiCategories[0]?.name ?? fallbackCategory,
            aiCategories,
        };
    }
    async createRequest(input) {
        if (!input.clientUserId) {
            throw new common_1.BadRequestException('clientUserId is required');
        }
        if (!input.title || !input.description || !input.address) {
            throw new common_1.BadRequestException('title, description and address are required');
        }
        if (!Number.isFinite(input.budget) || input.budget <= 0) {
            throw new common_1.BadRequestException('budget must be greater than 0');
        }
        if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
            throw new common_1.BadRequestException('latitude and longitude are required');
        }
        const photos = this.validateBase64Images(input.photosBase64, 5);
        const uploadedPhotosInput = this.validateUploadedImages(input.photos, 5);
        const fallbackCategory = input.category?.trim() || MobileService_1.DEFAULT_CATEGORY;
        const aiCategoriesInput = Array.isArray(input.aiCategories) && input.aiCategories.length > 0
            ? input.aiCategories
            : await this.classifyRequestCategoriesWithAi({
                title: input.title,
                description: input.description,
                fallbackCategory,
            });
        const aiCategories = this.normalizeAiCategories(aiCategoriesInput, fallbackCategory);
        const primaryCategory = aiCategories[0]?.name ||
            fallbackCategory ||
            MobileService_1.DEFAULT_CATEGORY;
        await this.ensureCategoriesExist([
            primaryCategory,
            ...aiCategories.map((item) => item.name),
        ]);
        await this.getUserById(input.clientUserId);
        const rows = await this.dataSource.query(`
      INSERT INTO job_requests (
        client_user_id,
        title,
        description,
        category,
        ai_categories,
        budget,
        price_type,
        scheduled_at,
        location,
        address,
        status,
        payment_method
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5::jsonb,
        $6::numeric,
        $7,
        $8,
        ST_SetSRID(ST_MakePoint($10::float8, $9::float8), 4326)::geography,
        $11,
        'searching',
        $12
      )
      RETURNING id, status, title, budget, address, ai_categories, created_at, payment_method
      `, [
            input.clientUserId,
            input.title,
            input.description,
            primaryCategory,
            JSON.stringify(aiCategories),
            input.budget,
            input.priceType,
            input.scheduledAt || null,
            input.latitude,
            input.longitude,
            input.address,
            input.paymentMethod || 'Efectivo',
        ]);
        const created = rows[0];
        const uploadedPhotos = uploadedPhotosInput.length > 0
            ? await this.persistUploadedRequestPhotos(created.id, uploadedPhotosInput)
            : await this.uploadRequestPhotos(created.id, photos);
        const notifiedWorkers = await this.seedOffersForRequest(created.id, input.budget);
        this.realtimeGateway.server.emit('request.published', {
            requestId: created.id,
            status: created.status,
            title: created.title,
            budget: Number(created.budget),
            address: created.address,
            latitude: Number(input.latitude),
            longitude: Number(input.longitude),
            timestamp: new Date().toISOString(),
        });
        return {
            request: {
                id: created.id,
                status: created.status,
                title: created.title,
                budget: Number(created.budget),
                address: created.address,
                aiCategories: this.parseAiCategories(created.ai_categories),
                createdAt: created.created_at,
                photos: uploadedPhotos,
            },
            notifiedWorkers,
        };
    }
    async uploadProfilePhoto(params) {
        const user = await this.getUserByIdWithPhotoMeta(params.userId);
        const incomingUrl = params.imageUrl?.trim();
        const incomingPublicId = params.imagePublicId?.trim();
        if (incomingUrl) {
            this.ensureSecureImageUrl(incomingUrl);
            await this.dataSource.query(`
      UPDATE users
      SET profile_photo_url = $2,
          profile_photo_public_id = $3,
          updated_at = NOW()
      WHERE id = $1
      `, [params.userId, incomingUrl, incomingPublicId || null]);
            if (user.profilePhotoPublicId &&
                (!incomingPublicId || user.profilePhotoPublicId !== incomingPublicId)) {
                await this.storageService.deleteImage(user.profilePhotoPublicId);
            }
            return {
                user: await this.getUserById(params.userId),
            };
        }
        const payload = params.imageBase64?.trim();
        if (!payload) {
            throw new common_1.BadRequestException('imageUrl or imageBase64 is required');
        }
        this.ensureDataUri(payload);
        const uploaded = await this.storageService.uploadBase64Image({
            base64Data: payload,
            folder: 'chamba/profile',
        });
        await this.dataSource.query(`
      UPDATE users
      SET profile_photo_url = $2,
          profile_photo_public_id = $3,
          updated_at = NOW()
      WHERE id = $1
      `, [params.userId, uploaded.url, uploaded.publicId]);
        if (user.profilePhotoPublicId &&
            user.profilePhotoPublicId !== uploaded.publicId) {
            await this.storageService.deleteImage(user.profilePhotoPublicId);
        }
        return {
            user: await this.getUserById(params.userId),
        };
    }
    async removeProfilePhoto(userId) {
        const user = await this.getUserByIdWithPhotoMeta(userId);
        await this.dataSource.query(`
      UPDATE users
      SET profile_photo_url = NULL,
          profile_photo_public_id = NULL,
          updated_at = NOW()
      WHERE id = $1
      `, [userId]);
        if (user.profilePhotoPublicId) {
            await this.storageService.deleteImage(user.profilePhotoPublicId);
        }
        return {
            user: await this.getUserById(userId),
        };
    }
    async submitWorkerVerification(params) {
        if (!params.workerUserId?.trim()) {
            throw new common_1.BadRequestException('workerUserId is required');
        }
        const user = await this.getUserById(params.workerUserId);
        if (user.type !== 'worker') {
            throw new common_1.BadRequestException('Only workers can submit verification');
        }
        const idPhotoBase64 = params.idPhotoBase64?.trim();
        const facePhotoBase64 = params.facePhotoBase64?.trim();
        if (!idPhotoBase64 || !facePhotoBase64) {
            throw new common_1.BadRequestException('idPhotoBase64 and facePhotoBase64 are required');
        }
        this.ensureDataUri(idPhotoBase64);
        this.ensureDataUri(facePhotoBase64);
        const idUpload = await this.storageService.uploadBase64Image({
            base64Data: idPhotoBase64,
            folder: 'chamba/verification/id',
        });
        const faceUpload = await this.storageService.uploadBase64Image({
            base64Data: facePhotoBase64,
            folder: 'chamba/verification/face',
        });
        await this.dataSource.query(`
      UPDATE users
      SET id_photo_url = $2,
          face_photo_url = $3,
          verification_status = 'pending',
          id_photo_verified = NULL,
          face_photo_verified = NULL,
          verification_reviewed_at = NULL,
          updated_at = NOW()
      WHERE id = $1
      `, [params.workerUserId, idUpload.url, faceUpload.url]);
        const updatedUser = await this.getUserById(params.workerUserId);
        this.realtimeGateway.emitToUser(params.workerUserId, 'user.verification.updated', {
            verificationStatus: 'pending',
            idPhotoVerified: null,
            facePhotoVerified: null,
            reviewedAt: null,
            message: 'Recibimos tus fotos. Nuestro equipo las esta revisando.',
        });
        return {
            submitted: true,
            user: updatedUser,
        };
    }
    async deleteRequestPhoto(params) {
        const rows = await this.dataSource.query(`
      SELECT p.id,
             p.public_id,
             p.request_id,
             jr.client_user_id
      FROM job_request_photos p
      JOIN job_requests jr ON jr.id = p.request_id
      WHERE p.id = $1
      LIMIT 1
      `, [params.requestPhotoId]);
        const photo = rows[0];
        if (!photo) {
            throw new common_1.NotFoundException('Request photo not found');
        }
        if (photo.client_user_id !== params.clientUserId) {
            throw new common_1.UnauthorizedException('Only the request owner can delete photos');
        }
        await this.dataSource.query(`DELETE FROM job_request_photos WHERE id = $1`, [params.requestPhotoId]);
        if (photo.public_id) {
            await this.storageService.deleteImage(photo.public_id);
        }
        return {
            deleted: true,
            requestPhotoId: params.requestPhotoId,
            requestId: photo.request_id,
        };
    }
    async upsertPushToken(params) {
        if (!params.userId) {
            throw new common_1.BadRequestException('userId is required');
        }
        const token = params.token?.trim();
        if (!token) {
            throw new common_1.BadRequestException('token is required');
        }
        await this.getUserById(params.userId);
        const rows = await this.dataSource.query(`
      INSERT INTO push_tokens (user_id, token, platform, last_seen_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (token)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        platform = EXCLUDED.platform,
        last_seen_at = NOW()
      RETURNING id, user_id, token, platform, last_seen_at
      `, [
            params.userId,
            token,
            (params.platform ?? 'unknown').trim().toLowerCase(),
        ]);
        return {
            pushToken: rows[0],
        };
    }
    async getRequestStatus(params) {
        const request = await this.resolveRequest(params);
        await this.expireStaleOffers(request.id);
        const photos = await this.getRequestPhotos(request.id);
        const metricRows = await this.dataSource.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE jo.status = 'pending'
            AND (jo.expires_at IS NULL OR jo.expires_at > NOW())
        )::text AS offers_count,
        COUNT(*) FILTER (
          WHERE jo.status = 'accepted'
        )::text AS accepted_count,
        MIN(
          CASE
            WHEN jo.status = 'pending'
                 AND (jo.expires_at IS NULL OR jo.expires_at > NOW())
                 AND u.current_location IS NOT NULL
              THEN ST_Distance(u.current_location, jr.location) / 1000.0
            ELSE NULL
          END
        ) AS nearest_worker_km
      FROM job_requests jr
      LEFT JOIN job_offers jo ON jo.request_id = jr.id
      LEFT JOIN users u ON u.id = jo.worker_user_id
      WHERE jr.id = $1
      `, [request.id]);
        const topOfferRows = await this.dataSource.query(`
      SELECT jo.id,
             jo.amount,
             jo.status,
             u.id AS worker_id,
             u.first_name,
             u.last_name,
             u.average_rating,
             u.completed_jobs
      FROM job_offers jo
      JOIN users u ON u.id = jo.worker_user_id
      WHERE jo.request_id = $1
        AND jo.status = 'pending'
        AND (jo.expires_at IS NULL OR jo.expires_at > NOW())
      ORDER BY jo.amount ASC, u.average_rating DESC
      LIMIT 3
      `, [request.id]);
        const metrics = metricRows[0] ?? {};
        const nearestKm = metrics.nearest_worker_km == null
            ? null
            : Number(metrics.nearest_worker_km);
        return {
            request: {
                ...request,
                photos,
            },
            metrics: {
                offersCount: Number(metrics.offers_count ?? 0),
                acceptedCount: Number(metrics.accepted_count ?? 0),
                estimatedMinutes: nearestKm == null ? null : Math.max(5, Math.ceil(nearestKm / 0.5)),
            },
            topOffers: topOfferRows.map((row) => ({
                id: row.id,
                amount: Number(row.amount),
                status: row.status,
                workerId: row.worker_id,
                workerName: `${row.first_name} ${row.last_name ?? ''}`.trim(),
                averageRating: Number(row.average_rating ?? 0),
                completedJobs: Number(row.completed_jobs ?? 0),
            })),
        };
    }
    async getOffers(params) {
        const request = await this.resolveRequest(params);
        const offerLifetimeSeconds = await this.getOfferLifetimeSeconds(request.priceType ?? request.price_type);
        await this.expireStaleOffers(request.id);
        const photos = await this.getRequestPhotos(request.id);
        const rows = await this.dataSource.query(`
      WITH skill_agg AS (
        SELECT ws.user_id, array_agg(ws.skill ORDER BY ws.skill) AS skills
        FROM worker_skills ws
        GROUP BY ws.user_id
      )
      SELECT jo.id AS offer_id,
             jo.amount,
             jo.status,
             jo.expires_at,
             EXTRACT(EPOCH FROM (jo.expires_at - NOW())) AS seconds_left,
             jo.message,
             u.id AS worker_id,
             u.first_name,
             u.last_name,
             u.profile_photo_url,
             u.average_rating,
             u.completed_jobs,
             sa.skills,
             CASE
               WHEN u.current_location IS NOT NULL
                 THEN ST_Distance(u.current_location, jr.location) / 1000.0
               ELSE NULL
             END AS distance_km
      FROM job_offers jo
      JOIN users u ON u.id = jo.worker_user_id
      JOIN job_requests jr ON jr.id = jo.request_id
      LEFT JOIN skill_agg sa ON sa.user_id = u.id
      WHERE jo.request_id = $1
        AND jo.status = 'pending'
        AND (jo.expires_at IS NULL OR jo.expires_at > NOW())
        AND jo.worker_user_id <> $2
      ORDER BY jo.amount ASC, u.average_rating DESC
      `, [request.id, request.clientUserId ?? request.client_user_id]);
        return {
            request: {
                ...request,
                photos,
            },
            offers: rows.map((row) => ({
                id: row.offer_id,
                amount: Number(row.amount),
                status: row.status,
                expiresAt: row.expires_at ?? null,
                secondsRemaining: row.seconds_left == null
                    ? null
                    : Math.max(0, Math.floor(Number(row.seconds_left))),
                message: row.message ?? '',
                worker: {
                    id: row.worker_id,
                    firstName: row.first_name,
                    lastName: row.last_name ?? '',
                    profilePhotoUrl: row.profile_photo_url ?? null,
                    averageRating: Number(row.average_rating ?? 0),
                    completedJobs: Number(row.completed_jobs ?? 0),
                    skills: row.skills ?? [],
                    distanceKm: row.distance_km == null ? null : Number(row.distance_km),
                },
            })),
            offerLifetimeSeconds,
        };
    }
    async getWorkerProfile(workerId) {
        const rows = await this.dataSource.query(`
      SELECT id,
             first_name,
             last_name,
             profile_photo_url,
             average_rating,
             completed_jobs,
             work_radius_km
      FROM users
      WHERE id = $1 AND type = 'worker'
      LIMIT 1
      `, [workerId]);
        const worker = rows[0];
        if (!worker) {
            throw new common_1.NotFoundException('Worker not found');
        }
        const skillRows = await this.dataSource.query(`SELECT skill FROM worker_skills WHERE user_id = $1 ORDER BY skill ASC`, [workerId]);
        const reviewRows = await this.dataSource.query(`
      SELECT r.stars,
             r.comment,
             r.created_at,
             CONCAT(c.first_name, ' ', COALESCE(c.last_name, '')) AS client_name
      FROM worker_reviews r
      JOIN users c ON c.id = r.client_user_id
      WHERE r.worker_user_id = $1
      ORDER BY r.created_at DESC
      LIMIT 10
      `, [workerId]);
        const galleryRows = await this.dataSource.query(`
      SELECT p.url
      FROM job_request_photos p
      JOIN job_offers jo ON jo.request_id = p.request_id
      WHERE jo.worker_user_id = $1
        AND jo.status = 'accepted'
      ORDER BY p.created_at DESC
      LIMIT 10
      `, [workerId]);
        return {
            worker: {
                id: worker.id,
                firstName: worker.first_name,
                lastName: worker.last_name ?? '',
                profilePhotoUrl: worker.profile_photo_url ?? null,
                averageRating: Number(worker.average_rating ?? 0),
                completedJobs: Number(worker.completed_jobs ?? 0),
                workRadiusKm: Number(worker.work_radius_km ?? 0),
                skills: skillRows.map((row) => row.skill),
                bio: 'Especialista verificado. Puntual, responsable y con experiencia en servicios de hogar.',
                gallery: galleryRows.map((row) => row.url),
            },
            reviews: reviewRows.map((row) => ({
                stars: Number(row.stars),
                comment: row.comment,
                createdAt: row.created_at,
                clientName: String(row.client_name ?? '').trim(),
            })),
        };
    }
    async getMessages(userId) {
        await this.getUserById(userId);
        const rows = await this.dataSource.query(`
      SELECT t.id AS thread_id,
             t.request_id,
             jr.title AS request_title,
             jr.description AS request_description,
             jr.status AS request_status,
             jr.budget AS request_budget,
             jr.category AS request_category,
             t.worker_user_id AS request_worker_id,
             t.client_user_id AS request_client_id,
             CASE WHEN t.client_user_id = $1 THEN t.worker_user_id ELSE t.client_user_id END AS counterpart_id,
             u.first_name AS counterpart_first_name,
             u.last_name AS counterpart_last_name,
             u.profile_photo_url AS counterpart_photo,
             lm.content AS last_message,
             lm.created_at AS last_message_at
      FROM chat_threads t
      JOIN users u
        ON u.id = CASE WHEN t.client_user_id = $1 THEN t.worker_user_id ELSE t.client_user_id END
      LEFT JOIN job_requests jr ON jr.id = t.request_id
      LEFT JOIN LATERAL (
        SELECT m.content, m.created_at
        FROM chat_messages m
        WHERE m.thread_id = t.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) lm ON true
      WHERE t.client_user_id = $1 OR t.worker_user_id = $1
      ORDER BY COALESCE(lm.created_at, t.updated_at) DESC
      `, [userId]);
        return {
            threads: rows.map((row) => ({
                id: row.thread_id,
                requestId: row.request_id ?? null,
                request: row.request_id ? {
                    id: row.request_id,
                    title: row.request_title,
                    description: row.request_description,
                    status: row.request_status,
                    budget: row.request_budget,
                    category: row.request_category,
                    workerId: row.request_worker_id,
                    clientId: row.request_client_id,
                } : null,
                counterpart: {
                    id: row.counterpart_id,
                    firstName: row.counterpart_first_name,
                    lastName: row.counterpart_last_name ?? '',
                    profilePhotoUrl: row.counterpart_photo ?? null,
                },
                lastMessage: row.last_message ?? 'Sin mensajes',
                lastMessageAt: row.last_message_at ?? null,
            })),
        };
    }
    async getThreadMessages(threadId, opts) {
        await this.ensureThreadExists(threadId);
        const limit = Math.min(200, Math.max(1, Math.floor(opts?.limit ?? 100)));
        const before = opts?.before && !Number.isNaN(Date.parse(opts.before))
            ? new Date(opts.before).toISOString()
            : null;
        const rows = await this.dataSource.query(`
      SELECT id, sender_user_id, content, created_at
      FROM chat_messages
      WHERE thread_id = $1
        AND ($2::timestamptz IS NULL OR created_at < $2::timestamptz)
      ORDER BY created_at DESC
      LIMIT $3
      `, [threadId, before, limit + 1]);
        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        page.reverse();
        return {
            threadId,
            hasMore,
            messages: page.map((row) => ({
                id: row.id,
                senderUserId: row.sender_user_id,
                content: row.content,
                createdAt: row.created_at,
            })),
        };
    }
    async archiveThread(params) {
        await this.ensureThreadExists(params.threadId);
        return { success: true };
    }
    async broadcastNotification(payload) {
        if (payload.type === 'toast') {
            this.realtimeGateway.server.emit('notification.toast', {
                target: payload.target,
                title: payload.title,
                body: payload.body,
                toastType: payload.toastType ?? 'info',
                userIds: payload.userIds,
            });
            return { success: true, method: 'socket' };
        }
        else {
            let query = `
        SELECT pt.token 
        FROM push_tokens pt
        JOIN users u ON u.id = pt.user_id
        WHERE pt.token IS NOT NULL
      `;
            const args = [];
            if (payload.target === 'workers') {
                query += ` AND u.type = $1`;
                args.push('worker');
            }
            else if (payload.target === 'clients') {
                query += ` AND u.type = $1`;
                args.push('client');
            }
            else if (payload.target === 'custom' && payload.userIds && payload.userIds.length > 0) {
                query += ` AND u.id = ANY($1::uuid[])`;
                args.push(payload.userIds);
            }
            else if (payload.target === 'custom') {
                return { success: true, method: 'push', count: 0 };
            }
            const rows = await this.dataSource.query(query, args);
            const tokens = rows.map((r) => r.token);
            const count = await this.notificationsService.broadcastPush({
                tokens,
                title: payload.title,
                body: payload.body,
            });
            return { success: true, method: 'push', count };
        }
    }
    async getPushUsers() {
        const query = `
      SELECT DISTINCT ON (u.id)
        u.id, 
        u.first_name as "firstName", 
        u.last_name as "lastName", 
        u.type, 
        pt.last_seen_at as "lastSeenAt"
      FROM push_tokens pt
      JOIN users u ON u.id = pt.user_id
      WHERE pt.token IS NOT NULL
      ORDER BY u.id, pt.last_seen_at DESC
    `;
        const rows = await this.dataSource.query(query);
        rows.sort((a, b) => {
            const dateA = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
            const dateB = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
            return dateB - dateA;
        });
        return rows.slice(0, 500);
    }
    async sendMessage(params) {
        if (!params.content?.trim()) {
            throw new common_1.BadRequestException('content is required');
        }
        await this.getUserById(params.senderUserId);
        await this.ensureThreadExists(params.threadId);
        const rows = await this.dataSource.query(`
      INSERT INTO chat_messages (thread_id, sender_user_id, content)
      VALUES ($1, $2, $3)
      RETURNING id, sender_user_id, content, created_at
      `, [params.threadId, params.senderUserId, params.content.trim()]);
        await this.dataSource.query(`UPDATE chat_threads SET updated_at = NOW() WHERE id = $1`, [params.threadId]);
        const threadRows = await this.dataSource.query(`
      SELECT request_id, client_user_id, worker_user_id
      FROM chat_threads
      WHERE id = $1
      LIMIT 1
      `, [params.threadId]);
        const thread = threadRows[0];
        const payload = {
            threadId: params.threadId,
            requestId: thread?.request_id ?? null,
            message: {
                id: rows[0].id,
                senderUserId: rows[0].sender_user_id,
                content: rows[0].content,
                createdAt: rows[0].created_at,
            },
        };
        this.realtimeGateway.emitToThread(params.threadId, 'message.new', payload);
        if (thread?.client_user_id) {
            this.realtimeGateway.emitToUser(thread.client_user_id, 'message.new', payload);
        }
        if (thread?.worker_user_id) {
            this.realtimeGateway.emitToUser(thread.worker_user_id, 'message.new', payload);
        }
        const recipientUserId = params.senderUserId === thread?.client_user_id
            ? thread?.worker_user_id
            : thread?.client_user_id;
        if (recipientUserId) {
            this.notifyRecipientOfNewMessage(recipientUserId, params.senderUserId, params.content, params.threadId).catch((err) => {
                this.logger.warn('Failed to send push notification for new message:', err.message);
            });
        }
        return {
            message: {
                id: rows[0].id,
                senderUserId: rows[0].sender_user_id,
                content: rows[0].content,
                createdAt: rows[0].created_at,
            },
        };
    }
    async notifyRecipientOfNewMessage(recipientUserId, senderUserId, message, threadId) {
        const senderRows = await this.dataSource.query(`SELECT first_name, last_name FROM users WHERE id = $1`, [senderUserId]);
        const senderName = senderRows[0]
            ? `${senderRows[0].first_name} ${senderRows[0].last_name ?? ''}`.trim()
            : 'Alguien';
        const tokenRows = await this.dataSource.query(`SELECT token AS push_token FROM push_tokens WHERE user_id = $1`, [recipientUserId]);
        if (!tokenRows[0]?.push_token)
            return;
        await this.notificationsService.notifyNewMessage({
            userId: recipientUserId,
            token: tokenRows[0].push_token,
            senderName,
            message,
            threadId,
        });
    }
    async getIncomingRequest(workerUserId) {
        await this.expireStaleOffers();
        await this.getUserById(workerUserId);
        const rows = await this.dataSource.query(`
      SELECT jr.id AS request_id,
             jr.title,
             jr.description,
             jr.category,
             jr.budget,
             jr.price_type,
             jr.address,
             jr.status,
             CASE
               WHEN w.current_location IS NOT NULL
                 THEN ST_Distance(jr.location, w.current_location) / 1000.0
               ELSE NULL
             END AS distance_km,
             c.id AS client_id,
             c.first_name AS client_first_name,
             c.last_name AS client_last_name,
             c.profile_photo_url AS client_photo_url,
             c.average_rating AS client_rating,
             c.completed_jobs AS client_reviews,
             c.verification_status AS client_verification,
             jo.id AS offer_id,
             jo.amount AS offer_amount,
             jo.status AS offer_status,
             jo.expires_at AS offer_expires_at,
             CASE
               WHEN jo.status = 'pending' AND jo.expires_at IS NOT NULL
                 THEN EXTRACT(EPOCH FROM (jo.expires_at - NOW()))
               ELSE NULL
             END AS offer_seconds_left
      FROM job_requests jr
      JOIN users w ON w.id = $1
      JOIN users c ON c.id = jr.client_user_id
      LEFT JOIN job_offers jo
        ON jo.request_id = jr.id
       AND jo.worker_user_id = $1
       AND jo.status <> 'expired'
       AND (jo.status <> 'pending' OR jo.expires_at IS NULL OR jo.expires_at > NOW())
      WHERE jr.client_user_id <> $1
        AND jr.id NOT IN (SELECT request_id FROM dismissed_requests WHERE worker_user_id = $1)
        AND jr.client_user_id NOT IN (SELECT blocked_user_id FROM user_blocks WHERE blocker_user_id = $1)
        AND jr.id NOT IN (SELECT request_id FROM request_reports WHERE reporter_user_id = $1)
        AND (
          (
            jr.status IN ('searching', 'negotiating')
            AND w.current_location IS NOT NULL
            AND ST_DWithin(
              jr.location,
              w.current_location,
              w.work_radius_km * 1000
            )
            AND (
              NOT EXISTS (SELECT 1 FROM worker_skills ws0 WHERE ws0.user_id = $1)
              OR EXISTS (
                SELECT 1
                FROM worker_skills ws
                WHERE ws.user_id = $1
                  AND (
                    LOWER(ws.skill) = LOWER(jr.category)
                    OR LOWER(ws.skill) IN (
                      SELECT LOWER(value->>'name')
                      FROM jsonb_array_elements(jr.ai_categories) value
                    )
                  )
              )
            )
          )
          OR (
            jr.status = 'assigned'
            AND EXISTS (
              SELECT 1
              FROM job_offers jo2
              WHERE jo2.request_id = jr.id
                AND jo2.worker_user_id = $1
                AND jo2.status = 'accepted'
            )
          )
        )
      ORDER BY
        CASE WHEN jr.status = 'assigned' THEN 0 ELSE 1 END,
        distance_km ASC NULLS LAST,
        jr.created_at DESC
      `, [workerUserId]);
        if (rows.length === 0) {
            return { requests: [] };
        }
        const offerLifetimeConfig = await this.getOfferLifetimeConfig();
        const requests = rows.map((row) => {
            const offerLifetimeSeconds = this.resolveOfferLifetimeSeconds(offerLifetimeConfig, row.price_type);
            return {
                id: row.request_id,
                title: row.title,
                description: row.description,
                category: row.category,
                budget: Number(row.budget),
                priceType: row.price_type,
                address: row.address,
                status: row.status,
                distanceKm: row.distance_km == null ? null : Number(row.distance_km),
                client: {
                    id: row.client_id,
                    name: `${row.client_first_name} ${row.client_last_name ?? ''}`.trim(),
                    profilePhotoUrl: row.client_photo_url ?? null,
                    rating: Number(row.client_rating ?? 0),
                    reviews: Number(row.client_reviews ?? 0),
                    isVerified: row.client_verification === 'verified',
                },
                workerOffer: row.offer_id
                    ? {
                        id: row.offer_id,
                        amount: Number(row.offer_amount ?? 0),
                        status: row.offer_status ?? 'pending',
                        expiresAt: row.offer_expires_at ?? null,
                        secondsRemaining: row.offer_seconds_left == null
                            ? null
                            : Math.max(0, Math.floor(Number(row.offer_seconds_left))),
                    }
                    : null,
                offerLifetimeSeconds,
            };
        });
        return {
            offerLifetimeSeconds: requests.length > 0 ? requests[0].offerLifetimeSeconds : 120,
            request: requests.length > 0 ? requests[0] : null,
            requests,
        };
    }
    async blockUser(blockerUserId, blockedUserId) {
        await this.dataSource.query(`INSERT INTO user_blocks (blocker_user_id, blocked_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [blockerUserId, blockedUserId]);
        return { success: true };
    }
    async reportRequest(requestId, reporterUserId, reason) {
        await this.dataSource.query(`INSERT INTO request_reports (request_id, reporter_user_id, reason) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [requestId, reporterUserId, reason]);
        const reqRes = await this.dataSource.query('SELECT client_user_id FROM job_requests WHERE id = $1', [requestId]);
        const reportedUserId = reqRes.length > 0 ? reqRes[0].client_user_id : null;
        await this.dataSource.query(`INSERT INTO disputes (request_id, reported_by, reported_user, reason, description)
       VALUES ($1, $2, $3, $4, $5)`, [requestId, reporterUserId, reportedUserId, 'Reporte de Publicación Inapropiada', reason]);
        return { success: true };
    }
    async dismissRequest(requestId, workerUserId) {
        await this.dataSource.query(`INSERT INTO dismissed_requests (request_id, worker_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [requestId, workerUserId]);
        return { success: true };
    }
    async upsertOffer(params) {
        if (!Number.isFinite(params.amount) || params.amount <= 0) {
            throw new common_1.BadRequestException('amount must be greater than 0');
        }
        await this.expireStaleOffers(params.requestId);
        await this.getUserById(params.workerUserId);
        const request = await this.getRequestById(params.requestId);
        const offerLifetimeSeconds = await this.getOfferLifetimeSeconds(request.price_type);
        if (!['searching', 'negotiating'].includes(request.status)) {
            throw new common_1.BadRequestException('La solicitud ya no admite nuevas ofertas');
        }
        const currentBudget = Number(request.budget);
        if (params.amount < currentBudget) {
            throw new common_1.BadRequestException(`Tu oferta (Bs ${params.amount}) no puede ser menor al precio actual del cliente (Bs ${currentBudget})`);
        }
        const existingRows = await this.dataSource.query(`
      SELECT id
      FROM job_offers
      WHERE request_id = $1 AND worker_user_id = $2
      LIMIT 1
      `, [params.requestId, params.workerUserId]);
        let offerId = '';
        if (existingRows[0]) {
            await this.dataSource.query(`
        UPDATE job_offers
        SET amount = $2,
            message = $3,
            status = 'pending',
            expires_at = NOW() + ($4::int * INTERVAL '1 second'),
            created_at = NOW()
        WHERE id = $1
        `, [
                existingRows[0].id,
                params.amount,
                params.message ?? null,
                offerLifetimeSeconds,
            ]);
            offerId = existingRows[0].id;
        }
        else {
            const rows = await this.dataSource.query(`
        INSERT INTO job_offers (request_id, worker_user_id, amount, message, status, expires_at)
        VALUES ($1, $2, $3, $4, 'pending', NOW() + ($5::int * INTERVAL '1 second'))
        RETURNING id
        `, [
                params.requestId,
                params.workerUserId,
                params.amount,
                params.message ?? null,
                offerLifetimeSeconds,
            ]);
            offerId = rows[0].id;
        }
        await this.dataSource.query(`
      UPDATE job_requests
      SET status = CASE WHEN status = 'searching' THEN 'negotiating' ELSE status END,
          updated_at = NOW()
      WHERE id = $1
      `, [params.requestId]);
        this.realtimeGateway.server.emit('request.status.updated', {
            requestId: params.requestId,
            status: 'negotiating',
            timestamp: new Date().toISOString(),
        });
        await this.ensureThreadAndInitialMessage({
            requestId: params.requestId,
            clientUserId: request.client_user_id,
            workerUserId: params.workerUserId,
            introMessage: params.message?.trim() ||
                `Hola, puedo ayudarte por Bs ${Math.round(params.amount)}. Estoy disponible.`,
        });
        const offerPayload = {
            id: offerId,
            requestId: params.requestId,
            workerUserId: params.workerUserId,
            clientUserId: request.client_user_id,
            amount: params.amount,
            message: params.message ?? '',
            status: 'pending',
            offerLifetimeSeconds,
            currentBudget,
        };
        this.realtimeGateway.emitToUser(request.client_user_id, 'offer.new', offerPayload);
        this.realtimeGateway.emitToUser(request.client_user_id, 'offer.updated', offerPayload);
        this.realtimeGateway.emitToUser(params.workerUserId, 'offer.updated', offerPayload);
        const otherWorkerRows = await this.dataSource.query(`
      SELECT DISTINCT worker_user_id
      FROM job_offers
      WHERE request_id = $1
        AND worker_user_id <> $2
        AND status = 'pending'
        AND (expires_at IS NULL OR expires_at > NOW())
      `, [params.requestId, params.workerUserId]);
        for (const row of otherWorkerRows) {
            this.realtimeGateway.emitToUser(row.worker_user_id, 'offer.updated', {
                ...offerPayload,
                workerUserId: row.worker_user_id,
            });
        }
        this.notifyClientOfNewOffer(params.requestId, params.workerUserId, params.amount, request.title).catch((err) => {
            this.logger.warn('Failed to send push notification for new offer:', err.message);
        });
        return {
            offer: {
                id: offerId,
                requestId: params.requestId,
                workerUserId: params.workerUserId,
                amount: params.amount,
                message: params.message ?? '',
                status: 'pending',
            },
        };
    }
    async notifyClientOfNewOffer(requestId, workerUserId, amount, jobTitle) {
        const workerRows = await this.dataSource.query(`SELECT first_name, last_name FROM users WHERE id = $1`, [workerUserId]);
        const workerName = workerRows[0]
            ? `${workerRows[0].first_name} ${workerRows[0].last_name ?? ''}`.trim()
            : 'Un trabajador';
        const requestRows = await this.dataSource.query(`SELECT client_user_id FROM job_requests WHERE id = $1`, [requestId]);
        if (!requestRows[0])
            return;
        const clientUserId = requestRows[0].client_user_id;
        const tokenRows = await this.dataSource.query(`SELECT token AS push_token FROM push_tokens WHERE user_id = $1`, [clientUserId]);
        if (!tokenRows[0]?.push_token)
            return;
        await this.notificationsService.notifyClientNewOffer({
            userId: clientUserId,
            token: tokenRows[0].push_token,
            workerName,
            amount,
            jobTitle,
            requestId,
        });
    }
    async acceptOffer(params) {
        await this.expireStaleOffers();
        const rows = await this.dataSource.query(`
      SELECT jo.id,
             jo.request_id,
             jo.worker_user_id,
             jr.client_user_id
      FROM job_offers jo
      JOIN job_requests jr ON jr.id = jo.request_id
      WHERE jo.id = $1
        AND jo.status <> 'expired'
        AND (jo.expires_at IS NULL OR jo.expires_at > NOW())
      LIMIT 1
      `, [params.offerId]);
        const offer = rows[0];
        if (!offer) {
            throw new common_1.NotFoundException('Offer not found');
        }
        if (offer.client_user_id !== params.clientUserId) {
            throw new common_1.UnauthorizedException('Solo el cliente puede aceptar la oferta');
        }
        const rejectedRows = await this.dataSource.query(`
      UPDATE job_offers
      SET status = 'rejected'
      WHERE request_id = $1
        AND id <> $2
        AND status <> 'expired'
      RETURNING id, worker_user_id
      `, [offer.request_id, params.offerId]);
        await this.dataSource.query(`UPDATE job_offers SET status = 'accepted' WHERE id = $1`, [params.offerId]);
        await this.dataSource.query(`UPDATE job_requests SET status = 'assigned', updated_at = NOW() WHERE id = $1`, [offer.request_id]);
        this.realtimeGateway.server.emit('request.status.updated', {
            requestId: offer.request_id,
            status: 'assigned',
            timestamp: new Date().toISOString(),
        });
        await this.dataSource.query(`UPDATE users SET is_available = false, updated_at = NOW() WHERE id = $1`, [offer.worker_user_id]);
        this.logger.log(`[acceptOffer] Worker ${offer.worker_user_id} marcado como no disponible (trabajo en curso)`);
        const payload = {
            offerId: params.offerId,
            requestId: offer.request_id,
            clientUserId: offer.client_user_id,
            workerUserId: offer.worker_user_id,
            accepted: true,
        };
        this.realtimeGateway.emitToUser(offer.client_user_id, 'offer.accepted', payload);
        this.realtimeGateway.emitToUser(offer.worker_user_id, 'offer.accepted', payload);
        for (const rejected of rejectedRows) {
            this.realtimeGateway.emitToUser(rejected.worker_user_id, 'offer.rejected', {
                offerId: rejected.id,
                requestId: offer.request_id,
                clientUserId: offer.client_user_id,
                workerUserId: rejected.worker_user_id,
                status: 'rejected',
                reason: 'selected_other_worker',
            });
        }
        this.notifyWorkerOfAcceptedOffer(offer.request_id, offer.worker_user_id, params.clientUserId).catch((err) => {
            this.logger.warn('Failed to send push notification for accepted offer:', err.message);
        });
        if (rejectedRows.length > 0) {
            const requestRows = await this.dataSource.query(`SELECT title FROM job_requests WHERE id = $1`, [offer.request_id]);
            const jobTitle = requestRows[0]?.title ?? 'un trabajo';
            for (const rejected of rejectedRows) {
                const tokenRows = await this.dataSource.query(`SELECT token AS push_token FROM push_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1`, [rejected.worker_user_id]);
                this.notificationsService.notifyOfferRejected({
                    userId: rejected.worker_user_id,
                    token: tokenRows[0]?.push_token || null,
                    jobTitle,
                    requestId: offer.request_id,
                }).catch(e => this.logger.error('Failed to notify offer rejected', e));
            }
        }
        return {
            accepted: true,
            requestId: offer.request_id,
            workerUserId: offer.worker_user_id,
        };
    }
    async notifyWorkerOfAcceptedOffer(requestId, workerUserId, clientUserId) {
        const clientRows = await this.dataSource.query(`SELECT first_name, last_name FROM users WHERE id = $1`, [clientUserId]);
        const clientName = clientRows[0]
            ? `${clientRows[0].first_name} ${clientRows[0].last_name ?? ''}`.trim()
            : 'Un cliente';
        const requestRows = await this.dataSource.query(`SELECT title FROM job_requests WHERE id = $1`, [requestId]);
        const jobTitle = requestRows[0]?.title ?? 'tu trabajo';
        const tokenRows = await this.dataSource.query(`SELECT push_token FROM users WHERE id = $1 AND push_token IS NOT NULL`, [workerUserId]);
        if (!tokenRows[0]?.push_token)
            return;
        await this.notificationsService.notifyWorkerOfferAccepted({
            userId: workerUserId,
            token: tokenRows[0].push_token,
            clientName,
            jobTitle,
            requestId,
        });
    }
    async discardOffer(params) {
        await this.dataSource.query(`
      UPDATE job_offers
      SET status = 'expired', expires_at = NOW()
      WHERE request_id = $1
        AND worker_user_id = $2
        AND status = 'pending'
      `, [params.requestId, params.workerUserId]);
        this.logger.log(`[discardOffer] Worker ${params.workerUserId} descartó su oferta en solicitud ${params.requestId}`);
        return { discarded: true, requestId: params.requestId };
    }
    async declineOffer(params) {
        const request = await this.getRequestById(params.requestId);
        const result = await this.dataSource.query(`
      UPDATE job_offers
      SET status = 'declined', expires_at = NULL
      WHERE request_id = $1
        AND worker_user_id = $2
        AND status IN ('pending', 'active')
      RETURNING id
      `, [params.requestId, params.workerUserId]);
        if (!result[0]) {
            const budget = Number(request.budget ?? 0);
            await this.dataSource.query(`
        INSERT INTO job_offers (request_id, worker_user_id, amount, status, expires_at)
        VALUES ($1, $2, $3, 'declined', NULL)
        ON CONFLICT (request_id, worker_user_id) DO UPDATE
          SET status = 'declined', expires_at = NULL
        `, [params.requestId, params.workerUserId, budget]);
        }
        const payload = {
            requestId: params.requestId,
            workerUserId: params.workerUserId,
            clientUserId: request.client_user_id,
            status: 'declined',
        };
        this.realtimeGateway.emitToUser(params.workerUserId, 'offer.updated', payload);
        this.realtimeGateway.emitToUser(request.client_user_id, 'offer.updated', payload);
        this.logger.log(`[declineOffer] Worker ${params.workerUserId} declinó solicitud ${params.requestId}`);
        return { declined: true, requestId: params.requestId };
    }
    async reactivateOffer(params) {
        await this.dataSource.query(`
      UPDATE job_offers
      SET status = 'expired', expires_at = NULL
      WHERE request_id = $1
        AND worker_user_id = $2
        AND status = 'declined'
      `, [params.requestId, params.workerUserId]);
        this.logger.log(`[reactivateOffer] Worker ${params.workerUserId} reactivó solicitud ${params.requestId}`);
        return { reactivated: true, requestId: params.requestId };
    }
    async clientCounterOffer(params) {
        if (!Number.isFinite(params.amount) || params.amount <= 0) {
            throw new common_1.BadRequestException('El monto debe ser mayor a 0');
        }
        const request = await this.getRequestById(params.requestId);
        if (request.client_user_id !== params.clientUserId) {
            throw new common_1.UnauthorizedException('Solo el cliente puede contraofertar');
        }
        if (!['searching', 'negotiating'].includes(request.status)) {
            throw new common_1.BadRequestException('La solicitud ya no admite contraofertas');
        }
        const currentBudget = Number(request.budget);
        if (params.amount <= currentBudget) {
            throw new common_1.BadRequestException(`Tu nueva oferta (Bs ${params.amount}) debe ser mayor a tu oferta actual (Bs ${currentBudget})`);
        }
        await this.dataSource.query(`UPDATE job_requests SET budget = $2, status = 'negotiating', updated_at = NOW() WHERE id = $1`, [params.requestId, params.amount]);
        const workerRows = await this.dataSource.query(`
      SELECT worker_user_id
      FROM job_offers
      WHERE request_id = $1
        AND status = 'pending'
      `, [params.requestId]);
        const payload = {
            requestId: params.requestId,
            newBudget: params.amount,
            clientUserId: params.clientUserId,
        };
        for (const row of workerRows) {
            this.realtimeGateway.emitToUser(row.worker_user_id, 'offer.client_counter', payload);
        }
        const client = await this.getUserById(params.clientUserId);
        for (const row of workerRows) {
            const tokenRows = await this.dataSource.query(`SELECT token AS push_token FROM push_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1`, [row.worker_user_id]);
            this.notificationsService.notifyWorkerCounterOffer({
                userId: row.worker_user_id,
                token: tokenRows[0]?.push_token || null,
                clientName: client.firstName,
                newAmount: params.amount,
                jobTitle: request.title,
                requestId: params.requestId,
            }).catch(e => this.logger.error('Failed to notify counter offer', e));
        }
        this.logger.log(`[clientCounterOffer] Cliente ${params.clientUserId} contraofertó Bs ${params.amount} en solicitud ${params.requestId}`);
        return { requestId: params.requestId, newBudget: params.amount };
    }
    async getTracking(requestId) {
        const rows = await this.dataSource.query(`
      SELECT jr.id AS request_id,
             jr.title,
             jr.address AS request_address,
             jr.status AS request_status,
             jr.worker_arrived,
             jr.client_confirmed_arrival,
             jr.completed_at,
             jr.work_started_at,
             jr.price_type,
             ST_Y(jr.location::geometry) AS dest_lat,
             ST_X(jr.location::geometry) AS dest_lng,
             w.id AS worker_id,
             w.first_name AS worker_first_name,
             w.last_name AS worker_last_name,
             w.profile_photo_url AS worker_photo,
             ST_Y(w.current_location::geometry) AS worker_lat,
             ST_X(w.current_location::geometry) AS worker_lng,
             CASE
               WHEN w.current_location IS NOT NULL
                 THEN ST_Distance(w.current_location, jr.location) / 1000.0
               ELSE NULL
             END AS distance_km,
             jo.amount,
             c.id AS client_id,
             c.first_name AS client_first_name,
             c.last_name AS client_last_name,
             c.profile_photo_url AS client_photo
      FROM job_requests jr
      JOIN job_offers jo ON jo.request_id = jr.id AND jo.status = 'accepted'
      JOIN users w ON w.id = jo.worker_user_id
      JOIN users c ON c.id = jr.client_user_id
      WHERE jr.id = $1
      LIMIT 1
      `, [requestId]);
        const row = rows[0];
        if (!row) {
            throw new common_1.NotFoundException('No tracking available for this request');
        }
        const distanceKm = row.distance_km == null ? null : Number(row.distance_km);
        return {
            requestId: row.request_id,
            title: row.title,
            address: row.request_address,
            status: row.request_status,
            priceType: row.price_type,
            workerArrived: row.worker_arrived ?? false,
            clientConfirmedArrival: row.client_confirmed_arrival ?? false,
            completedAt: row.completed_at ?? null,
            workStartedAt: row.work_started_at ?? null,
            workElapsedSeconds: row.work_started_at
                ? Math.floor((Date.now() - new Date(row.work_started_at).getTime()) / 1000)
                : null,
            distanceKm,
            etaMinutes: distanceKm == null ? null : Math.max(5, Math.ceil(distanceKm / 0.5)),
            agreedAmount: Number(row.amount),
            destination: {
                latitude: row.dest_lat ? Number(row.dest_lat) : null,
                longitude: row.dest_lng ? Number(row.dest_lng) : null,
            },
            worker: {
                id: row.worker_id,
                firstName: row.worker_first_name,
                lastName: row.worker_last_name ?? '',
                profilePhotoUrl: row.worker_photo ?? null,
                latitude: row.worker_lat ? Number(row.worker_lat) : null,
                longitude: row.worker_lng ? Number(row.worker_lng) : null,
            },
            client: {
                id: row.client_id,
                firstName: row.client_first_name,
                lastName: row.client_last_name ?? '',
                profilePhotoUrl: row.client_photo ?? null,
            },
        };
    }
    async workerMarkArrived(params) {
        const rows = await this.dataSource.query(`
      UPDATE job_requests
      SET worker_arrived = true, updated_at = NOW()
      WHERE id = $1
        AND EXISTS (
          SELECT 1 FROM job_offers jo
          WHERE jo.request_id = $1
            AND jo.worker_user_id = $2
            AND jo.status = 'accepted'
        )
      RETURNING id, worker_arrived, client_confirmed_arrival
      `, [params.requestId, params.workerUserId]);
        if (!rows[0])
            throw new common_1.NotFoundException('Request not found or not authorized');
        this.realtimeGateway.emitToUser(params.workerUserId, 'job.worker_arrived', {
            requestId: params.requestId,
        });
        const clientRows = await this.dataSource.query(`
      SELECT jr.client_user_id, jr.title, u.first_name as worker_name, pt.token
      FROM job_requests jr
      JOIN users u ON u.id = $2
      LEFT JOIN push_tokens pt ON pt.user_id = jr.client_user_id
      WHERE jr.id = $1
      `, [params.requestId, params.workerUserId]);
        if (clientRows[0]) {
            const clientUserId = clientRows[0].client_user_id;
            this.realtimeGateway.emitToUser(clientUserId, 'job.worker_arrived', {
                requestId: params.requestId,
            });
            if (clientRows[0].token) {
                await this.notificationsService.notifyWorkerArrived({
                    userId: clientUserId,
                    token: clientRows[0].token,
                    workerName: clientRows[0].worker_name,
                    jobTitle: clientRows[0].title,
                    requestId: params.requestId,
                }).catch((e) => this.logger.error('Failed to send worker arrived notification', e));
            }
        }
        return { requestId: params.requestId, workerArrived: true };
    }
    async clientConfirmArrival(params) {
        const rows = await this.dataSource.query(`
      UPDATE job_requests
      SET client_confirmed_arrival = true,
          work_started_at = NOW(),
          updated_at = NOW()
      WHERE id = $1 AND client_user_id = $2
      RETURNING id, worker_arrived, client_confirmed_arrival, work_started_at
      `, [params.requestId, params.clientUserId]);
        if (!rows[0])
            throw new common_1.NotFoundException('Request not found or not authorized');
        const offerRows = await this.dataSource.query(`SELECT worker_user_id FROM job_offers WHERE request_id = $1 AND status = 'accepted' LIMIT 1`, [params.requestId]);
        if (offerRows[0]) {
            this.realtimeGateway.emitToUser(offerRows[0].worker_user_id, 'job.client_confirmed', {
                requestId: params.requestId,
            });
            const workerTokenRows = await this.dataSource.query(`SELECT token AS push_token FROM push_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1`, [offerRows[0].worker_user_id]);
            const clientUser = await this.getUserById(params.clientUserId);
            const reqInfo = await this.getRequestById(params.requestId);
            this.notificationsService.notifyClientConfirmedArrival({
                userId: offerRows[0].worker_user_id,
                token: workerTokenRows[0]?.push_token || null,
                clientName: clientUser.firstName,
                jobTitle: reqInfo.title,
                requestId: params.requestId,
            }).catch(e => this.logger.error('Failed to notify arrival confirmed', e));
        }
        return { requestId: params.requestId, clientConfirmedArrival: true };
    }
    async completeJob(params) {
        const checkRows = await this.dataSource.query(`
      SELECT jr.id, jr.client_confirmed_arrival, jr.client_user_id
      FROM job_requests jr
      JOIN job_offers jo ON jo.request_id = jr.id AND jo.worker_user_id = $2 AND jo.status = 'accepted'
      WHERE jr.id = $1
      LIMIT 1
      `, [params.requestId, params.workerUserId]);
        const req = checkRows[0];
        if (!req)
            throw new common_1.NotFoundException('Request not found or not authorized');
        if (!req.client_confirmed_arrival) {
            throw new common_1.BadRequestException('El cliente aún no ha confirmado tu llegada');
        }
        await this.dataSource.query(`
      UPDATE job_requests
      SET status = 'completed', completed_at = NOW(), updated_at = NOW()
      WHERE id = $1
      `, [params.requestId]);
        this.realtimeGateway.server.emit('request.status.updated', {
            requestId: params.requestId,
            status: 'completed',
            timestamp: new Date().toISOString(),
        });
        await this.dataSource.query(`UPDATE users SET is_available = true, updated_at = NOW() WHERE id = $1`, [params.workerUserId]);
        this.logger.log(`[completeJob] Worker ${params.workerUserId} restaurado como disponible`);
        this.realtimeGateway.emitToUser(params.workerUserId, 'job.completed', { requestId: params.requestId });
        this.realtimeGateway.emitToUser(req.client_user_id, 'job.completed', { requestId: params.requestId });
        const infoRows = await this.dataSource.query(`
      SELECT jr.title, u.first_name as worker_name, pt.token
      FROM job_requests jr
      JOIN users u ON u.id = $2
      LEFT JOIN push_tokens pt ON pt.user_id = jr.client_user_id
      WHERE jr.id = $1
      `, [params.requestId, params.workerUserId]);
        if (infoRows[0]?.token) {
            await this.notificationsService.notifyJobFinished({
                userId: req.client_user_id,
                token: infoRows[0].token,
                workerName: infoRows[0].worker_name,
                jobTitle: infoRows[0].title,
                requestId: params.requestId,
            }).catch((e) => this.logger.error('Failed to send job finished notification', e));
        }
        this.logger.log(`[completeJob] Trabajo ${params.requestId} completado por worker ${params.workerUserId}`);
        return { requestId: params.requestId, status: 'completed' };
    }
    async cancelJob(params) {
        const rows = await this.dataSource.query(`
      SELECT jr.id, jr.title, jr.client_user_id, jo.worker_user_id
      FROM job_requests jr
      LEFT JOIN job_offers jo ON jo.request_id = jr.id AND jo.status = 'accepted'
      WHERE jr.id = $1
        AND (jr.client_user_id = $2 OR jo.worker_user_id = $2)
      LIMIT 1
      `, [params.requestId, params.userId]);
        const req = rows[0];
        if (!req)
            throw new common_1.NotFoundException('Request not found or not authorized');
        await this.dataSource.query(`UPDATE job_requests SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [params.requestId]);
        this.realtimeGateway.server.emit('request.status.updated', {
            requestId: params.requestId,
            status: 'cancelled',
            timestamp: new Date().toISOString(),
        });
        if (req.worker_user_id) {
            await this.dataSource.query(`UPDATE users SET is_available = true, updated_at = NOW() WHERE id = $1`, [req.worker_user_id]);
            this.logger.log(`[cancelJob] Worker ${req.worker_user_id} restaurado como disponible`);
        }
        if (req.client_user_id) {
            this.realtimeGateway.emitToUser(req.client_user_id, 'job.cancelled', { requestId: params.requestId });
        }
        if (req.worker_user_id) {
            this.realtimeGateway.emitToUser(req.worker_user_id, 'job.cancelled', { requestId: params.requestId });
        }
        const canceler = await this.getUserById(params.userId);
        const targetUserId = req.client_user_id === params.userId ? req.worker_user_id : req.client_user_id;
        if (targetUserId) {
            const tokenRows = await this.dataSource.query(`SELECT token AS push_token FROM push_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1`, [targetUserId]);
            await this.notificationsService.notifyJobCancelled({
                userId: targetUserId,
                token: tokenRows[0]?.push_token || null,
                cancelerName: canceler.firstName,
                jobTitle: req.title,
                requestId: params.requestId,
            }).catch(e => this.logger.error('Failed to notify cancel', e));
        }
        return { requestId: params.requestId, status: 'cancelled' };
    }
    async getWorkerRadar(workerUserId) {
        const worker = await this.getUserById(workerUserId);
        const rows = await this.dataSource.query(`
      WITH jobs AS (
        SELECT COUNT(*)::text AS jobs_today,
               COALESCE(SUM(jo.amount), 0)::text AS earnings_today
        FROM job_offers jo
        JOIN job_requests jr ON jr.id = jo.request_id
        WHERE jo.worker_user_id = $1
          AND jo.status = 'accepted'
          AND DATE(jr.created_at) = CURRENT_DATE
      ),
      nearby AS (
        SELECT COUNT(*)::text AS nearby_requests
        FROM users w
        JOIN job_requests jr ON true
        WHERE w.id = $1
          AND w.current_location IS NOT NULL
          AND jr.status IN ('searching', 'negotiating')
          AND ST_DWithin(jr.location, w.current_location, w.work_radius_km * 1000)
      )
      SELECT jobs.jobs_today, jobs.earnings_today, nearby.nearby_requests
      FROM jobs, nearby
      `, [workerUserId]);
        const skills = await this.getWorkerSkills(workerUserId);
        return {
            worker,
            available: worker.isAvailable,
            location: {
                latitude: worker.currentLatitude,
                longitude: worker.currentLongitude,
                workRadiusKm: worker.workRadiusKm,
            },
            summary: {
                jobsToday: Number(rows[0]?.jobs_today ?? 0),
                earningsToday: Number(rows[0]?.earnings_today ?? 0),
                nearbyRequests: Number(rows[0]?.nearby_requests ?? 0),
            },
            skills: skills.skills,
        };
    }
    async getAdminMapSnapshot(params) {
        const sinceIso = params.since && !Number.isNaN(Date.parse(params.since))
            ? new Date(params.since).toISOString()
            : null;
        const workers = await this.dataSource.query(`
      SELECT u.id,
             u.first_name,
             u.last_name,
             u.is_available,
             u.average_rating,
             u.completed_jobs,
             u.updated_at,
             ST_Y(u.current_location::geometry) AS latitude,
             ST_X(u.current_location::geometry) AS longitude,
             jr.id AS active_request_id,
             jr.title AS active_request_title,
             jr.status AS active_request_status,
             jr.address AS active_request_address,
             jr.worker_arrived AS active_worker_arrived,
             c.first_name AS active_client_first_name,
             c.last_name AS active_client_last_name
      FROM users u
      LEFT JOIN job_offers jo ON jo.worker_user_id = u.id AND jo.status = 'accepted'
      LEFT JOIN job_requests jr ON jr.id = jo.request_id AND jr.status IN ('assigned', 'in_progress')
      LEFT JOIN users c ON c.id = jr.client_user_id
      WHERE u.type = 'worker'
        AND u.current_location IS NOT NULL
        AND ($1::timestamptz IS NULL OR u.updated_at >= $1::timestamptz)
      ORDER BY u.updated_at DESC
      LIMIT 10000
      `, [sinceIso]);
        const clients = await this.dataSource.query(`
      SELECT u.id,
             u.first_name,
             u.last_name,
             u.updated_at,
             ST_Y(u.current_location::geometry) AS latitude,
             ST_X(u.current_location::geometry) AS longitude
      FROM users u
      WHERE u.type = 'client'
        AND u.current_location IS NOT NULL
        AND ($1::timestamptz IS NULL OR u.updated_at >= $1::timestamptz)
      ORDER BY u.updated_at DESC
      LIMIT 5000
      `, [sinceIso]);
        const requests = await this.dataSource.query(`
      SELECT jr.id,
             jr.title,
             jr.status,
             jr.budget,
             jr.address,
             jr.updated_at,
             jr.created_at,
             u.first_name AS client_first_name,
             u.last_name AS client_last_name,
             ST_Y(jr.location::geometry) AS latitude,
             ST_X(jr.location::geometry) AS longitude,
             (
               SELECT p.url
               FROM job_request_photos p
               WHERE p.request_id = jr.id
               ORDER BY p.created_at ASC
               LIMIT 1
             ) AS photo_url
      FROM job_requests jr
      JOIN users u ON u.id = jr.client_user_id
      WHERE jr.location IS NOT NULL
        AND ($1::timestamptz IS NULL OR jr.updated_at >= $1::timestamptz)
      ORDER BY jr.updated_at DESC
      LIMIT 5000
      `, [sinceIso]);
        return {
            serverTime: new Date().toISOString(),
            workers: workers.map((row) => ({
                id: row.id,
                firstName: row.first_name,
                lastName: row.last_name ?? '',
                isAvailable: row.is_available,
                averageRating: Number(row.average_rating ?? 0),
                completedJobs: Number(row.completed_jobs ?? 0),
                latitude: Number(row.latitude),
                longitude: Number(row.longitude),
                updatedAt: row.updated_at,
                activeRequest: row.active_request_id ? {
                    id: row.active_request_id,
                    title: row.active_request_title,
                    status: row.active_request_status,
                    address: row.active_request_address,
                    workerArrived: row.active_worker_arrived ?? false,
                    clientName: [row.active_client_first_name, row.active_client_last_name].filter(Boolean).join(' '),
                } : null,
            })),
            clients: clients.map((row) => ({
                id: row.id,
                firstName: row.first_name,
                lastName: row.last_name ?? '',
                latitude: Number(row.latitude),
                longitude: Number(row.longitude),
                updatedAt: row.updated_at,
            })),
            requests: requests.map((row) => ({
                id: row.id,
                title: row.title,
                status: row.status,
                budget: Number(row.budget ?? 0),
                address: row.address,
                clientName: `${row.client_first_name ?? ''} ${row.client_last_name ?? ''}`.trim(),
                latitude: Number(row.latitude),
                longitude: Number(row.longitude),
                updatedAt: row.updated_at,
                createdAt: row.created_at,
                photoUrl: row.photo_url ?? null,
            })),
        };
    }
    async getAdminWallet(params) {
        const period = params.period ?? 'week';
        const interval = period === 'day'
            ? `NOW() - INTERVAL '1 day'`
            : period === 'month'
                ? `NOW() - INTERVAL '1 month'`
                : `NOW() - INTERVAL '7 days'`;
        const rows = await this.dataSource.query(`
      SELECT u.id,
             u.first_name,
             u.last_name,
             COUNT(*)::int AS jobs_completed,
             COALESCE(SUM(jo.amount), 0)::numeric AS earnings
      FROM job_offers jo
      JOIN users u ON u.id = jo.worker_user_id
      JOIN job_requests jr ON jr.id = jo.request_id
      WHERE jo.status = 'accepted'
        AND jr.created_at >= ${interval}
      GROUP BY u.id, u.first_name, u.last_name
      ORDER BY earnings DESC
      LIMIT 500
      `);
        const totals = rows.reduce((acc, row) => {
            acc.totalEarnings += Number(row.earnings ?? 0);
            acc.totalJobs += Number(row.jobs_completed ?? 0);
            return acc;
        }, { totalEarnings: 0, totalJobs: 0 });
        return {
            period,
            totals,
            workers: rows.map((row) => ({
                id: row.id,
                name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
                jobsCompleted: Number(row.jobs_completed ?? 0),
                earnings: Number(row.earnings ?? 0),
            })),
        };
    }
    async setWorkerAvailability(workerUserId, available) {
        const rows = await this.dataSource.query(`
      UPDATE users
      SET is_available = $2,
          updated_at = NOW()
      WHERE id = $1 AND type = 'worker'
      RETURNING id, is_available
      `, [workerUserId, available]);
        if (!rows[0]) {
            throw new common_1.NotFoundException('Worker not found');
        }
        return {
            workerId: rows[0].id,
            isAvailable: rows[0].is_available,
        };
    }
    async updateWorkerLocation(params) {
        if (!Number.isFinite(params.latitude) ||
            !Number.isFinite(params.longitude)) {
            throw new common_1.BadRequestException('latitude and longitude are required');
        }
        const rows = await this.dataSource.query(`
      UPDATE users
      SET current_location = ST_SetSRID(ST_MakePoint($3::float8, $2::float8), 4326)::geography,
          updated_at = NOW()
      WHERE id = $1 AND type = 'worker'
      RETURNING id,
                ST_Y(current_location::geometry) AS latitude,
                ST_X(current_location::geometry) AS longitude
      `, [params.workerUserId, params.latitude, params.longitude]);
        if (!rows[0]) {
            throw new common_1.NotFoundException('Worker not found');
        }
        const payload = {
            workerId: rows[0].id,
            latitude: Number(rows[0].latitude),
            longitude: Number(rows[0].longitude),
            timestamp: new Date().toISOString(),
        };
        this.realtimeGateway.server.emit('worker.location.updated', payload);
        return {
            ...payload,
        };
    }
    async updateClientLocation(params) {
        if (!Number.isFinite(params.latitude) ||
            !Number.isFinite(params.longitude)) {
            throw new common_1.BadRequestException('latitude and longitude are required');
        }
        const rows = await this.dataSource.query(`
      UPDATE users
      SET current_location = ST_SetSRID(ST_MakePoint($3::float8, $2::float8), 4326)::geography,
          updated_at = NOW()
      WHERE id = $1 AND type = 'client'
      RETURNING id,
                ST_Y(current_location::geometry) AS latitude,
                ST_X(current_location::geometry) AS longitude
      `, [params.clientUserId, params.latitude, params.longitude]);
        if (!rows[0]) {
            throw new common_1.NotFoundException('Client not found');
        }
        const payload = {
            clientId: rows[0].id,
            latitude: Number(rows[0].latitude),
            longitude: Number(rows[0].longitude),
            timestamp: new Date().toISOString(),
        };
        this.realtimeGateway.broadcastClientLocationUpdated(payload.clientId, payload.latitude, payload.longitude, payload.timestamp);
        return payload;
    }
    async getWorkerSkills(workerUserId) {
        await this.getUserById(workerUserId);
        const rows = await this.dataSource.query(`SELECT skill FROM worker_skills WHERE user_id = $1 ORDER BY skill ASC`, [workerUserId]);
        return {
            workerUserId,
            skills: rows.map((row) => row.skill),
        };
    }
    async listCategories() {
        const rows = await this.dataSource.query(`
      SELECT id,
             name,
             description,
             icon,
             parent_id,
             is_active,
             created_at,
             updated_at
      FROM categories
      WHERE is_active = true
      ORDER BY name ASC
      `);
        return {
            categories: rows.map((row) => ({
                id: row.id,
                name: row.name,
                description: row.description ?? '',
                icon: row.icon ?? null,
                parentId: row.parent_id ?? null,
                active: row.is_active,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            })),
        };
    }
    async createCategory(input) {
        const name = input.name?.trim();
        if (!name) {
            throw new common_1.BadRequestException('name is required');
        }
        const id = (input.id?.trim() || this.toCategoryId(name)).toLowerCase();
        if (!/^[a-z0-9_]+$/.test(id)) {
            throw new common_1.BadRequestException('id must contain only lowercase letters, numbers and underscore');
        }
        if (input.parentId?.trim()) {
            const parentRows = await this.dataSource.query(`SELECT id FROM categories WHERE id = $1 LIMIT 1`, [input.parentId.trim().toLowerCase()]);
            if (!parentRows[0]) {
                throw new common_1.BadRequestException('parentId not found');
            }
        }
        const rows = await this.dataSource.query(`
      INSERT INTO categories (id, name, description, icon, parent_id, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id)
      DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        icon = EXCLUDED.icon,
        parent_id = EXCLUDED.parent_id,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id, name, description, icon, parent_id, is_active, created_at, updated_at
      `, [
            id,
            name,
            input.description?.trim() || '',
            input.icon?.trim() || null,
            input.parentId?.trim().toLowerCase() || null,
            input.active ?? true,
        ]);
        return {
            category: {
                id: rows[0].id,
                name: rows[0].name,
                description: rows[0].description ?? '',
                icon: rows[0].icon ?? null,
                parentId: rows[0].parent_id ?? null,
                active: rows[0].is_active,
                createdAt: rows[0].created_at,
                updatedAt: rows[0].updated_at,
            },
        };
    }
    async updateWorkerSkills(workerUserId, skills) {
        await this.getUserById(workerUserId);
        const sanitized = [
            ...new Set((skills ?? []).map((item) => item.trim()).filter(Boolean)),
        ].slice(0, 20);
        await this.ensureCategoriesExist(sanitized);
        await this.dataSource.query(`DELETE FROM worker_skills WHERE user_id = $1`, [workerUserId]);
        for (const skill of sanitized) {
            await this.dataSource.query(`INSERT INTO worker_skills (user_id, skill) VALUES ($1, $2)`, [workerUserId, skill]);
        }
        return {
            workerUserId,
            skills: sanitized,
        };
    }
    async getWorkerHistory(workerUserId) {
        await this.getUserById(workerUserId);
        const rows = await this.dataSource.query(`
      SELECT jo.id AS offer_id,
             jo.amount,
             jo.status AS offer_status,
             jo.created_at AS accepted_at,
             jr.id AS request_id,
             jr.title,
             jr.description,
             jr.category,
             jr.address,
             jr.status AS request_status,
             c.id AS client_id,
             c.first_name AS client_first_name,
             c.last_name AS client_last_name,
             c.profile_photo_url AS client_photo,
             ct.id AS thread_id,
             (SELECT p.url FROM job_request_photos p WHERE p.request_id = jr.id ORDER BY p.created_at ASC LIMIT 1) as photo_url
      FROM job_offers jo
      JOIN job_requests jr ON jr.id = jo.request_id
      JOIN users c ON c.id = jr.client_user_id
      LEFT JOIN chat_threads ct
        ON ct.request_id = jr.id
       AND ct.worker_user_id = jo.worker_user_id
       AND ct.client_user_id = jr.client_user_id
      WHERE jo.worker_user_id = $1
        AND jo.status IN ('accepted', 'rejected')
        AND jr.status IN ('assigned', 'completed', 'cancelled')
      ORDER BY jo.created_at DESC
      LIMIT 80
      `, [workerUserId]);
        return {
            workerUserId,
            jobs: rows.map((row) => ({
                offerId: row.offer_id,
                requestId: row.request_id,
                title: row.title,
                description: row.description,
                category: row.category,
                address: row.address,
                amount: Number(row.amount),
                offerStatus: row.offer_status,
                requestStatus: row.request_status,
                acceptedAt: row.accepted_at,
                threadId: row.thread_id ?? null,
                photoUrl: row.photo_url ?? null,
                client: {
                    id: row.client_id,
                    firstName: row.client_first_name,
                    lastName: row.client_last_name ?? '',
                    profilePhotoUrl: row.client_photo ?? null,
                },
            })),
        };
    }
    async getClientHistory(clientUserId) {
        await this.getUserById(clientUserId);
        const rows = await this.dataSource.query(`
      SELECT jr.id AS request_id,
             jr.title,
             jr.description,
             jr.category,
             jr.address,
             jr.status AS request_status,
             jr.created_at,
             jo.id AS offer_id,
             jo.amount,
             jo.status AS offer_status,
             w.id AS worker_id,
             w.first_name AS worker_first_name,
             w.last_name AS worker_last_name,
             w.profile_photo_url AS worker_photo,
             ct.id AS thread_id,
             (SELECT p.url FROM job_request_photos p WHERE p.request_id = jr.id ORDER BY p.created_at ASC LIMIT 1) as photo_url
      FROM job_requests jr
      LEFT JOIN job_offers jo ON jo.request_id = jr.id AND jo.status IN ('accepted', 'rejected')
      LEFT JOIN users w ON w.id = jo.worker_user_id
      LEFT JOIN chat_threads ct
        ON ct.request_id = jr.id
       AND ct.worker_user_id = w.id
       AND ct.client_user_id = jr.client_user_id
      WHERE jr.client_user_id = $1
        AND jr.status IN ('assigned', 'completed', 'cancelled')
      ORDER BY jr.created_at DESC
      LIMIT 80
      `, [clientUserId]);
        return {
            clientUserId,
            jobs: rows.map((row) => ({
                requestId: row.request_id,
                title: row.title,
                description: row.description,
                category: row.category,
                address: row.address,
                amount: row.amount ? Number(row.amount) : null,
                offerId: row.offer_id ?? null,
                offerStatus: row.offer_status ?? null,
                requestStatus: row.request_status,
                createdAt: row.created_at,
                threadId: row.thread_id ?? null,
                photoUrl: row.photo_url ?? null,
                worker: row.worker_id ? {
                    id: row.worker_id,
                    firstName: row.worker_first_name,
                    lastName: row.worker_last_name ?? '',
                    profilePhotoUrl: row.worker_photo ?? null,
                } : null,
            })),
        };
    }
    async createReview(params) {
        if (!Number.isInteger(params.stars) ||
            params.stars < 1 ||
            params.stars > 5) {
            throw new common_1.BadRequestException('stars must be between 1 and 5');
        }
        await this.getUserById(params.workerUserId);
        await this.getUserById(params.clientUserId);
        const req = await this.getRequestById(params.requestId);
        if (req.status !== 'completed') {
            throw new common_1.BadRequestException('Request is not completed yet');
        }
        if (req.client_user_id !== params.clientUserId) {
            throw new common_1.BadRequestException('Client user ID does not match the request');
        }
        const insertResult = await this.dataSource.query(`
      INSERT INTO worker_reviews (request_id, worker_user_id, client_user_id, stars, comment)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (request_id) DO NOTHING
      RETURNING id
      `, [
            params.requestId,
            params.workerUserId,
            params.clientUserId,
            params.stars,
            params.comment ?? null,
        ]);
        if (!insertResult.length) {
            return { saved: false, alreadyReviewed: true };
        }
        const rows = await this.dataSource.query(`
      SELECT COALESCE(AVG(r.stars), 0) AS average_rating,
             (SELECT COUNT(*)::text
              FROM job_requests jr
              JOIN job_offers jo ON jo.request_id = jr.id
              WHERE jo.worker_user_id = $1 AND jo.status = 'accepted' AND jr.status = 'completed'
             ) AS completed_jobs
      FROM worker_reviews r
      WHERE r.worker_user_id = $1
      `, [params.workerUserId]);
        await this.dataSource.query(`
      UPDATE users
      SET average_rating = $2,
          completed_jobs = $3,
          updated_at = NOW()
      WHERE id = $1
      `, [
            params.workerUserId,
            Number(rows[0]?.average_rating ?? 0),
            Number(rows[0]?.completed_jobs ?? 0),
        ]);
        const clientUser = await this.getUserById(params.clientUserId);
        const workerTokenRows = await this.dataSource.query(`SELECT token AS push_token FROM push_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1`, [params.workerUserId]);
        this.notificationsService.notifyNewReview({
            userId: params.workerUserId,
            token: workerTokenRows[0]?.push_token || null,
            clientName: clientUser.firstName,
            stars: params.stars,
            jobTitle: req.title,
            requestId: params.requestId,
        }).catch(e => this.logger.error('Failed to notify new review', e));
        return {
            saved: true,
            workerUserId: params.workerUserId,
            averageRating: Number(rows[0]?.average_rating ?? 0),
            completedJobs: Number(rows[0]?.completed_jobs ?? 0),
        };
    }
    async ensureSchema() {
        const statements = [
            `CREATE EXTENSION IF NOT EXISTS postgis;`,
            `CREATE EXTENSION IF NOT EXISTS pgcrypto;`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_public_id TEXT NULL;`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'not_verified';`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS id_photo_url TEXT NULL;`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS face_photo_url TEXT NULL;`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS id_photo_verified BOOLEAN NULL;`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS face_photo_verified BOOLEAN NULL;`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_reviewed_at TIMESTAMPTZ NULL;`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT NULL;`,
            `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);`,
            `
      CREATE TABLE IF NOT EXISTS auth_credentials (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        password TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      `,
            `ALTER TABLE auth_credentials ALTER COLUMN password DROP NOT NULL;`,
            `
      CREATE TABLE IF NOT EXISTS job_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        budget NUMERIC(12,2) NOT NULL,
        price_type TEXT NOT NULL,
        scheduled_at TIMESTAMPTZ NULL,
        location GEOGRAPHY(Point, 4326) NOT NULL,
        address TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'searching',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      `,
            `ALTER TABLE job_requests ADD COLUMN IF NOT EXISTS ai_categories JSONB NOT NULL DEFAULT '[]'::jsonb;`,
            `ALTER TABLE job_requests ADD COLUMN IF NOT EXISTS worker_arrived BOOLEAN NOT NULL DEFAULT false;`,
            `ALTER TABLE job_requests ADD COLUMN IF NOT EXISTS client_confirmed_arrival BOOLEAN NOT NULL DEFAULT false;`,
            `ALTER TABLE job_requests ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL;`,
            `ALTER TABLE job_requests ADD COLUMN IF NOT EXISTS work_started_at TIMESTAMPTZ NULL;`,
            `ALTER TABLE job_requests ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'Efectivo';`,
            `
      CREATE TABLE IF NOT EXISTS job_offers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id UUID NOT NULL REFERENCES job_requests(id) ON DELETE CASCADE,
        worker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount NUMERIC(12,2) NOT NULL,
        message TEXT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        expires_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (request_id, worker_user_id)
      );
      `,
            `ALTER TABLE job_offers ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL;`,
            `
      CREATE TABLE IF NOT EXISTS chat_threads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id UUID NULL REFERENCES job_requests(id) ON DELETE SET NULL,
        client_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        worker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (request_id, client_user_id, worker_user_id)
      );
      `,
            `
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        thread_id UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
        sender_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      `,
            `
      CREATE TABLE IF NOT EXISTS worker_skills (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        skill TEXT NOT NULL,
        PRIMARY KEY (user_id, skill)
      );
      `,
            `
      CREATE TABLE IF NOT EXISTS worker_reviews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id UUID NOT NULL REFERENCES job_requests(id) ON DELETE CASCADE,
        worker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        client_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        stars INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
        comment TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      `,
            `CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_reviews_request ON worker_reviews(request_id);`,
            `
      CREATE TABLE IF NOT EXISTS job_request_photos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id UUID NOT NULL REFERENCES job_requests(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        public_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      `,
            `
      CREATE TABLE IF NOT EXISTS push_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        platform TEXT NOT NULL DEFAULT 'unknown',
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      `,
            `
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT NULL,
        icon TEXT NULL,
        parent_id TEXT NULL REFERENCES categories(id) ON DELETE SET NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      `,
            `
      CREATE TABLE IF NOT EXISTS app_config (
        key TEXT PRIMARY KEY,
        value_json JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      `,
            `CREATE INDEX IF NOT EXISTS idx_job_requests_location ON job_requests USING GIST(location);`,
            `CREATE INDEX IF NOT EXISTS idx_users_current_location ON users USING GIST(current_location);`,
            `CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created ON chat_messages(thread_id, created_at DESC);`,
            `CREATE INDEX IF NOT EXISTS idx_job_offers_request ON job_offers(request_id);`,
            `CREATE INDEX IF NOT EXISTS idx_job_request_photos_request ON job_request_photos(request_id);`,
            `CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);`,
            `CREATE INDEX IF NOT EXISTS idx_categories_active_name ON categories(is_active, name);`,
            `
      CREATE TABLE IF NOT EXISTS disputes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id UUID NULL REFERENCES job_requests(id) ON DELETE CASCADE,
        reported_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reported_user UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        reason TEXT NOT NULL,
        description TEXT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        resolution TEXT NULL,
        resolved_by TEXT NULL,
        resolved_at TIMESTAMPTZ NULL,
        user_last_read_at TIMESTAMPTZ NULL,
        admin_last_read_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      `,
            `CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);`,
            `CREATE INDEX IF NOT EXISTS idx_disputes_request ON disputes(request_id);`,
            `ALTER TABLE disputes ALTER COLUMN request_id DROP NOT NULL;`,
            `ALTER TABLE disputes ADD COLUMN IF NOT EXISTS user_last_read_at TIMESTAMPTZ NULL;`,
            `ALTER TABLE disputes ADD COLUMN IF NOT EXISTS admin_last_read_at TIMESTAMPTZ NULL;`,
            `
      CREATE TABLE IF NOT EXISTS dispute_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
        sender_type TEXT NOT NULL DEFAULT 'user',
        sender_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      `,
            `CREATE INDEX IF NOT EXISTS idx_dispute_messages_dispute ON dispute_messages(dispute_id, created_at ASC);`,
            `
      CREATE TABLE IF NOT EXISTS user_blocks (
        blocker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        blocked_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (blocker_user_id, blocked_user_id)
      );
      `,
            `
      CREATE TABLE IF NOT EXISTS request_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id UUID NOT NULL REFERENCES job_requests(id) ON DELETE CASCADE,
        reporter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reason TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (request_id, reporter_user_id)
      );
      `,
            `
      CREATE TABLE IF NOT EXISTS dismissed_requests (
        request_id UUID NOT NULL REFERENCES job_requests(id) ON DELETE CASCADE,
        worker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (request_id, worker_user_id)
      );
      `
        ];
        for (const statement of statements) {
            await this.dataSource.query(statement);
        }
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
        const radiusKm = await this.getWorkerNotificationRadiusKm();
        return {
            radiusKm,
        };
    }
    async updateAdminWorkerNotificationSettings(params) {
        const parsed = Number(params.radiusKm);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            throw new common_1.BadRequestException('radiusKm must be greater than 0');
        }
        const radiusKm = Math.min(50, Math.max(0.5, parsed));
        await this.dataSource.query(`
      INSERT INTO app_config (key, value_json, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()
      `, [
            MobileService_1.WORKER_NOTIFICATION_RADIUS_CONFIG_KEY,
            JSON.stringify({ radiusKm }),
        ]);
        return { radiusKm };
    }
    async getRequestNotifiedWorkers(requestId) {
        if (!requestId) {
            throw new common_1.BadRequestException('requestId is required');
        }
        const rows = await this.dataSource.query(`
      SELECT n.user_id,
             n.created_at AS notified_at,
             u.first_name,
             u.last_name,
             u.profile_photo_url,
             u.phone,
             u.average_rating,
             u.completed_jobs,
             jo.status AS offer_status,
             jo.amount AS offer_amount
      FROM notifications n
      JOIN users u ON u.id = n.user_id
      LEFT JOIN job_offers jo
        ON jo.request_id = $1::uuid AND jo.worker_user_id = n.user_id
      WHERE n.type = 'request_new'
        AND n.data->>'jobId' = $1::text
      ORDER BY n.created_at ASC
      `, [requestId]);
        return {
            requestId,
            total: rows.length,
            workers: rows.map((row) => ({
                id: row.user_id,
                firstName: row.first_name,
                lastName: row.last_name ?? '',
                profilePhotoUrl: row.profile_photo_url ?? null,
                phone: row.phone ?? null,
                averageRating: Number(row.average_rating ?? 0),
                completedJobs: Number(row.completed_jobs ?? 0),
                notifiedAt: row.notified_at,
                offerStatus: row.offer_status ?? null,
                offerAmount: row.offer_amount != null ? Number(row.offer_amount) : null,
            })),
        };
    }
    extractTopCategories(workerRows) {
        const counter = new Map();
        for (const row of workerRows) {
            for (const skill of row.skills ?? []) {
                counter.set(skill, (counter.get(skill) ?? 0) + 1);
            }
        }
        return [...counter.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([skill]) => skill);
    }
    async listFallbackCategories() {
        const rows = await this.dataSource.query(`
      SELECT name
      FROM categories
      WHERE is_active = true
      ORDER BY name ASC
      LIMIT 8
      `);
        return rows.map((row) => String(row.name ?? '').trim()).filter(Boolean);
    }
    normalizePriceTypeKey(priceType) {
        const normalized = String(priceType ?? '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
        if (normalized.includes('hora') || normalized.includes('hour')) {
            return 'hour';
        }
        if (normalized.includes('dia') || normalized.includes('day')) {
            return 'day';
        }
        return 'fixed';
    }
    async getOfferLifetimeConfig() {
        const rows = await this.dataSource.query(`
      SELECT value_json
      FROM app_config
      WHERE key = $1
      LIMIT 1
      `, [MobileService_1.OFFER_LIFETIME_CONFIG_KEY]);
        const config = rows[0]?.value_json;
        return config && typeof config === 'object' ? config : null;
    }
    resolveOfferLifetimeSeconds(config, priceType) {
        const fallback = MobileService_1.OFFER_LIFETIME_SECONDS;
        if (!config) {
            return fallback;
        }
        const key = this.normalizePriceTypeKey(priceType);
        const candidate = key === 'hour'
            ? config.hour
            : key === 'day'
                ? config.day
                : config.fixed;
        const parsed = Number(candidate);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return fallback;
        }
        return Math.floor(parsed);
    }
    async getOfferLifetimeSeconds(priceType) {
        const config = await this.getOfferLifetimeConfig();
        return this.resolveOfferLifetimeSeconds(config, priceType);
    }
    async getWorkerNotificationRadiusKm() {
        const rows = await this.dataSource.query(`
      SELECT value_json
      FROM app_config
      WHERE key = $1
      LIMIT 1
      `, [MobileService_1.WORKER_NOTIFICATION_RADIUS_CONFIG_KEY]);
        const config = rows[0]?.value_json;
        const candidate = Number(config?.radiusKm);
        if (!Number.isFinite(candidate) || candidate <= 0) {
            return 5;
        }
        return Math.min(50, Math.max(0.5, candidate));
    }
    async resolveRequest(params) {
        if (params.requestId) {
            return this.getRequestById(params.requestId);
        }
        if (!params.clientUserId) {
            throw new common_1.BadRequestException('requestId or clientUserId is required');
        }
        const request = await this.findLatestClientRequest(params.clientUserId);
        if (!request) {
            throw new common_1.NotFoundException('No request found');
        }
        return request;
    }
    async findLatestClientRequest(clientUserId) {
        const rows = await this.dataSource.query(`
      SELECT jr.id,
             jr.client_user_id,
             jr.title,
             jr.description,
             jr.category,
             jr.ai_categories,
             jr.budget,
             jr.price_type,
             jr.address,
             jr.status,
             jr.created_at,
             (SELECT COUNT(*) FROM job_offers jo WHERE jo.request_id = jr.id AND jo.status = 'pending') AS pending_offers_count
      FROM job_requests jr
      WHERE jr.client_user_id = $1
      ORDER BY jr.created_at DESC
      LIMIT 1
      `, [clientUserId]);
        const row = rows[0];
        if (!row) {
            return null;
        }
        return {
            id: row.id,
            clientUserId: row.client_user_id,
            title: row.title,
            description: row.description,
            category: row.category,
            aiCategories: this.parseAiCategories(row.ai_categories),
            budget: Number(row.budget),
            priceType: row.price_type,
            address: row.address,
            status: row.status,
            createdAt: row.created_at,
            pendingOffersCount: Number(row.pending_offers_count ?? 0),
        };
    }
    async getRequestById(requestId) {
        const rows = await this.dataSource.query(`
      SELECT id,
             client_user_id,
             title,
             description,
             category,
             ai_categories,
             budget,
             price_type,
             address,
             status,
             location,
             created_at
      FROM job_requests
      WHERE id = $1
      LIMIT 1
      `, [requestId]);
        const row = rows[0];
        if (!row) {
            throw new common_1.NotFoundException('Request not found');
        }
        return {
            id: row.id,
            client_user_id: row.client_user_id,
            title: row.title,
            description: row.description,
            category: row.category,
            aiCategories: this.parseAiCategories(row.ai_categories),
            budget: Number(row.budget),
            price_type: row.price_type,
            address: row.address,
            status: row.status,
            location: row.location,
            created_at: row.created_at,
        };
    }
    async getUserById(userId) {
        const rows = await this.dataSource.query(`
      SELECT id,
             type,
             first_name,
             last_name,
             email,
             phone,
             profile_photo_url,
             profile_photo_public_id,
             verification_status,
             id_photo_url,
             face_photo_url,
             id_photo_verified,
             face_photo_verified,
             verification_reviewed_at,
             is_available,
             work_radius_km,
             ST_Y(current_location::geometry) AS current_latitude,
             ST_X(current_location::geometry) AS current_longitude
      FROM users
      WHERE id = $1
      LIMIT 1
      `, [userId]);
        const row = rows[0];
        if (!row) {
            throw new common_1.NotFoundException('User not found');
        }
        return {
            id: row.id,
            type: row.type,
            firstName: row.first_name,
            lastName: row.last_name ?? null,
            email: row.email,
            phone: row.phone ?? null,
            profilePhotoUrl: row.profile_photo_url ?? null,
            profilePhotoPublicId: row.profile_photo_public_id ?? null,
            verificationStatus: row.verification_status ?? 'not_verified',
            idPhotoUrl: row.id_photo_url ?? null,
            facePhotoUrl: row.face_photo_url ?? null,
            idPhotoVerified: row.id_photo_verified ?? null,
            facePhotoVerified: row.face_photo_verified ?? null,
            verificationReviewedAt: row.verification_reviewed_at ?? null,
            isAvailable: row.is_available,
            workRadiusKm: Number(row.work_radius_km ?? 0),
            currentLatitude: row.current_latitude == null ? null : Number(row.current_latitude),
            currentLongitude: row.current_longitude == null ? null : Number(row.current_longitude),
        };
    }
    async getUserByIdWithPhotoMeta(userId) {
        return this.getUserById(userId);
    }
    normalizePhone(value) {
        const digits = String(value ?? '').replace(/\D+/g, '');
        if (!digits) {
            return null;
        }
        if (digits.length === 9 && digits.startsWith('0')) {
            return digits.slice(1);
        }
        if (digits.length > 8 && digits.startsWith('591')) {
            return digits.slice(-8);
        }
        return digits;
    }
    buildRequestTitle(params) {
        const explicitTitle = params.title?.trim();
        if (explicitTitle) {
            return explicitTitle;
        }
        const description = params.description?.trim() ?? '';
        if (description) {
            if (description.length <= 64) {
                return description;
            }
            return `${description.slice(0, 61).trim()}...`;
        }
        return `Solicitud de ${params.fallbackCategory.toLowerCase()}`;
    }
    normalizeAiCategories(input, fallbackCategory) {
        if (!Array.isArray(input) || input.length === 0) {
            return [
                {
                    id: this.toCategoryId(fallbackCategory),
                    name: fallbackCategory.trim() || 'General',
                    confidence: 0.5,
                },
            ];
        }
        const normalized = [];
        const seen = new Set();
        for (const item of input) {
            if (!item || typeof item !== 'object') {
                continue;
            }
            const data = item;
            const rawName = String(data.name ?? data.nombre ?? fallbackCategory ?? 'General').trim();
            const safeName = rawName || 'General';
            const rawId = String(data.id ?? this.toCategoryId(safeName))
                .trim()
                .toLowerCase();
            const id = rawId || this.toCategoryId(safeName);
            if (!id || seen.has(id)) {
                continue;
            }
            seen.add(id);
            const confidence = Number(data.confidence ?? data.confianza ?? 0.5);
            normalized.push({
                id,
                name: safeName,
                confidence: Number.isFinite(confidence)
                    ? Math.max(0, Math.min(1, confidence))
                    : 0.5,
            });
        }
        if (normalized.length === 0) {
            return [
                {
                    id: this.toCategoryId(fallbackCategory),
                    name: fallbackCategory.trim() || 'General',
                    confidence: 0.5,
                },
            ];
        }
        return normalized;
    }
    parseAiCategories(value) {
        if (!value) {
            return [];
        }
        let parsed = value;
        if (typeof value === 'string') {
            try {
                parsed = JSON.parse(value);
            }
            catch (_) {
                return [];
            }
        }
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed
            .filter((item) => item && typeof item === 'object')
            .map((item) => item)
            .map((item) => ({
            id: String(item.id ?? '').trim(),
            name: String(item.name ?? '').trim(),
            confidence: Number(item.confidence ?? 0),
        }))
            .filter((item) => Boolean(item.id) && Boolean(item.name));
    }
    async classifyRequestCategoriesWithAi(params) {
        const fallbackCategory = params.fallbackCategory?.trim() || MobileService_1.DEFAULT_CATEGORY;
        const catalog = await this.listActiveCategoryCatalogForAi();
        if (catalog.length === 0) {
            this.logger.warn('[Gemini] Catálogo vacío, usando fallback');
            return [
                {
                    id: this.toCategoryId(fallbackCategory),
                    name: fallbackCategory,
                    confidence: 0.5,
                },
            ];
        }
        const aiConfig = await this.getAiConfig();
        const activeProvider = aiConfig.activeProvider || 'nvidia';
        let endpointUrl = '';
        let apiKey = '';
        let modelName = '';
        if (activeProvider === 'nvidia' && aiConfig.nvidiaKey) {
            endpointUrl = 'https://integrate.api.nvidia.com/v1/chat/completions';
            apiKey = aiConfig.nvidiaKey;
            modelName = this.configService.get('NVIDIA_MODEL')?.trim() || 'minimaxai/minimax-m2.7';
        }
        else if (activeProvider === 'gemini' && aiConfig.geminiKey) {
            endpointUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
            apiKey = aiConfig.geminiKey;
            modelName = 'gemini-2.0-flash';
        }
        else if (activeProvider === 'deepseek' && aiConfig.deepseekKey) {
            endpointUrl = 'https://api.deepseek.com/v1/chat/completions';
            apiKey = aiConfig.deepseekKey;
            modelName = 'deepseek-chat';
        }
        else {
            this.logger.warn(`[AI] API Key no configurada para ${activeProvider} → usando fallback "${fallbackCategory}".`);
            return [
                {
                    id: this.toCategoryId(fallbackCategory),
                    name: fallbackCategory,
                    confidence: 0.5,
                },
            ];
        }
        this.logger.log(`[AI] Clasificando con ${activeProvider}: "${params.title}" | "${params.description.slice(0, 60)}…"`);
        const categoryCatalog = catalog
            .map((item) => `- id: ${item.id}, nombre: ${item.name}`)
            .join('\n');
        const prompt = `
Eres un asistente que clasifica solicitudes de trabajo en Bolivia.

Catalogo de categorias permitidas:
${categoryCatalog}

Entrada del usuario:
- titulo: ${params.title ?? ''}
- descripcion: ${params.description ?? ''}

Reglas obligatorias:
1) Devuelve SOLO JSON valido.
2) Formato exacto:
{
  "categorias": [
    { "id": "string", "nombre": "string", "confianza": 0.0 }
  ]
}
3) Ordena por confianza descendente.
4) Devuelve una o varias categorias segun corresponda, sin limite fijo.
5) El "id" y "nombre" deben pertenecer al catalogo permitido.
6) Si hay duda, incluye "trabajo_general" / "General".
7) No agregues texto fuera del JSON.
`.trim();
        const endpoint = new URL(endpointUrl);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), MobileService_1.GEMINI_TIMEOUT_MS);
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: modelName,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0,
                    top_p: 0.95,
                    max_tokens: 480,
                    stream: false,
                    response_format: { type: 'json_object' },
                }),
                signal: controller.signal,
            });
            if (!response.ok) {
                const errBody = await response.text().catch(() => '');
                this.logger.error(`[${activeProvider}] HTTP ${response.status} → fallback "${fallbackCategory}" | detalle: ${errBody.slice(0, 300)}`);
                return [
                    {
                        id: this.toCategoryId(fallbackCategory),
                        name: fallbackCategory,
                        confidence: 0.5,
                    },
                ];
            }
            const payload = (await response.json());
            const text = payload.choices?.[0]?.message?.content?.trim() ?? '';
            if (!text) {
                this.logger.warn(`[${activeProvider}] Respuesta vacía → fallback`);
                return [
                    {
                        id: this.toCategoryId(fallbackCategory),
                        name: fallbackCategory,
                        confidence: 0.5,
                    },
                ];
            }
            const parsed = this.parseAiCategoriesFromText({
                text,
                catalog,
                fallbackCategory,
            });
            if (parsed.length > 0) {
                this.logger.log(`[${activeProvider}] Categorías detectadas: ${parsed.map((c) => c.name).join(', ')}`);
                return parsed;
            }
            this.logger.warn(`[${activeProvider}] No se pudo parsear respuesta → fallback`);
            return [
                {
                    id: this.toCategoryId(fallbackCategory),
                    name: fallbackCategory,
                    confidence: 0.5,
                },
            ];
        }
        catch (err) {
            const msg = err?.message ?? String(err);
            this.logger.error(`[${activeProvider}] Error: ${msg} → fallback "${fallbackCategory}"`);
            return [
                {
                    id: this.toCategoryId(fallbackCategory),
                    name: fallbackCategory,
                    confidence: 0.5,
                },
            ];
        }
        finally {
            clearTimeout(timeout);
        }
    }
    parseAiCategoriesFromText(params) {
        const byId = new Map(params.catalog.map((item) => [item.id.trim().toLowerCase(), item]));
        const byName = new Map(params.catalog.map((item) => [item.name.trim().toLowerCase(), item]));
        let decoded;
        try {
            decoded = JSON.parse(params.text);
        }
        catch (_) {
            const start = params.text.indexOf('{');
            const end = params.text.lastIndexOf('}');
            if (start < 0 || end <= start) {
                return [];
            }
            try {
                decoded = JSON.parse(params.text.slice(start, end + 1));
            }
            catch (_) {
                return [];
            }
        }
        if (!decoded || typeof decoded !== 'object') {
            return [];
        }
        const rawCategories = decoded.categorias;
        if (!Array.isArray(rawCategories)) {
            return [];
        }
        const output = [];
        const seen = new Set();
        for (const item of rawCategories) {
            if (!item || typeof item !== 'object') {
                continue;
            }
            const row = item;
            const rawId = String(row.id ?? '')
                .trim()
                .toLowerCase();
            const rawName = String(row.nombre ?? row.name ?? '').trim();
            const resolved = (rawId ? byId.get(rawId) : undefined) ??
                (rawName ? byName.get(rawName.toLowerCase()) : undefined) ??
                (rawName
                    ? params.catalog.find((category) => category.name.toLowerCase().includes(rawName.toLowerCase()))
                    : undefined);
            if (!resolved || seen.has(resolved.id)) {
                continue;
            }
            seen.add(resolved.id);
            const confidenceRaw = Number(row.confianza ?? row.confidence ?? 0.5);
            output.push({
                id: resolved.id,
                name: resolved.name,
                confidence: Number.isFinite(confidenceRaw)
                    ? Math.max(0, Math.min(1, confidenceRaw))
                    : 0.5,
            });
        }
        output.sort((a, b) => b.confidence - a.confidence);
        return output;
    }
    async listActiveCategoryCatalogForAi() {
        const rows = await this.dataSource.query(`
      SELECT id, name
      FROM categories
      WHERE is_active = true
      ORDER BY name ASC
      LIMIT 250
      `);
        const catalog = rows
            .map((row) => ({
            id: String(row.id ?? '')
                .trim()
                .toLowerCase(),
            name: String(row.name ?? '').trim(),
        }))
            .filter((row) => row.id && row.name);
        const hasGeneral = catalog.some((item) => item.id === 'trabajo_general' || item.name.toLowerCase() === 'general');
        if (!hasGeneral) {
            catalog.push({
                id: 'trabajo_general',
                name: MobileService_1.DEFAULT_CATEGORY,
            });
        }
        return catalog;
    }
    toCategoryId(value) {
        return (value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '') || 'trabajo_general');
    }
    validateBase64Images(input, limit) {
        if (!Array.isArray(input)) {
            return [];
        }
        const values = input
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean);
        if (values.length > limit) {
            throw new common_1.BadRequestException(`Maximum ${limit} images are allowed`);
        }
        for (const value of values) {
            this.ensureDataUri(value);
        }
        return values;
    }
    ensureDataUri(value) {
        const pattern = /^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\n\r]+$/;
        if (!pattern.test(value)) {
            throw new common_1.UnsupportedMediaTypeException('Only base64 image data URI payloads are supported');
        }
    }
    validateUploadedImages(images, limit) {
        if (!images || images.length === 0) {
            return [];
        }
        if (images.length > limit) {
            throw new common_1.BadRequestException(`Maximum ${limit} images are allowed`);
        }
        return images.map((item, index) => {
            const url = item?.url?.trim();
            const publicId = item?.publicId?.trim();
            if (!url || !publicId) {
                throw new common_1.BadRequestException(`photos[${index}] must include url and publicId`);
            }
            this.ensureSecureImageUrl(url);
            return { url, publicId };
        });
    }
    ensureSecureImageUrl(value) {
        try {
            const parsed = new URL(value);
            if (parsed.protocol !== 'https:') {
                throw new common_1.UnsupportedMediaTypeException('Only HTTPS image urls are supported');
            }
        }
        catch (_) {
            throw new common_1.UnsupportedMediaTypeException('Invalid image URL');
        }
    }
    async uploadRequestPhotos(requestId, images) {
        const uploaded = [];
        for (const base64Data of images) {
            const result = await this.storageService.uploadBase64Image({
                base64Data,
                folder: 'chamba/requests',
            });
            await this.dataSource.query(`
        INSERT INTO job_request_photos (request_id, url, public_id)
        VALUES ($1, $2, $3)
        `, [requestId, result.url, result.publicId]);
            uploaded.push(result.url);
        }
        return uploaded;
    }
    async persistUploadedRequestPhotos(requestId, images) {
        const uploaded = [];
        for (const image of images) {
            await this.dataSource.query(`
        INSERT INTO job_request_photos (request_id, url, public_id)
        VALUES ($1, $2, $3)
        `, [requestId, image.url, image.publicId]);
            uploaded.push(image.url);
        }
        return uploaded;
    }
    async getRequestPhotos(requestId) {
        const rows = await this.dataSource.query(`
      SELECT id, url, created_at
      FROM job_request_photos
      WHERE request_id = $1
      ORDER BY created_at ASC
      `, [requestId]);
        return rows.map((row) => ({
            id: row.id,
            url: row.url,
            createdAt: row.created_at,
        }));
    }
    async ensureThreadExists(threadId) {
        const rows = await this.dataSource.query(`SELECT id FROM chat_threads WHERE id = $1 LIMIT 1`, [threadId]);
        if (!rows[0]) {
            throw new common_1.NotFoundException('Thread not found');
        }
    }
    async ensureThreadAndInitialMessage(params) {
        const rows = await this.dataSource.query(`
      INSERT INTO chat_threads (request_id, client_user_id, worker_user_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (request_id, client_user_id, worker_user_id)
      DO UPDATE SET updated_at = NOW()
      RETURNING id
      `, [params.requestId, params.clientUserId, params.workerUserId]);
        const threadId = rows[0].id;
        const existing = await this.dataSource.query(`SELECT id FROM chat_messages WHERE thread_id = $1 LIMIT 1`, [threadId]);
        if (!existing[0]) {
            await this.dataSource.query(`
        INSERT INTO chat_messages (thread_id, sender_user_id, content)
        VALUES ($1, $2, $3)
        `, [threadId, params.workerUserId, params.introMessage]);
        }
        return threadId;
    }
    async seedOffersForRequest(requestId, baseBudget) {
        const request = await this.getRequestById(requestId);
        const notificationRadiusKm = await this.getWorkerNotificationRadiusKm();
        const normalizedSkills = [
            ...new Set([
                request.category,
                ...(request.aiCategories ?? []).map((item) => item.name),
            ]),
        ]
            .map((value) => String(value ?? '')
            .trim()
            .toLowerCase())
            .filter(Boolean);
        const isGeneral = normalizedSkills.length === 0 ||
            normalizedSkills.every((s) => s === 'general');
        const workers = await this.dataSource.query(`
      SELECT u.id,
             ST_Distance(u.current_location, $1::geography) / 1000.0 AS distance_km
      FROM users u
      WHERE u.type = 'worker'
        AND u.is_available = true
        AND u.current_location IS NOT NULL
        AND ST_DWithin(u.current_location, $1::geography, $4::float8 * 1000)
        AND (
          $2::boolean = true
          OR cardinality($3::text[]) = 0
          OR EXISTS (
            SELECT 1
            FROM worker_skills ws
            WHERE ws.user_id = u.id
              AND LOWER(ws.skill) = ANY($3::text[])
          )
          OR NOT EXISTS (
            SELECT 1 FROM worker_skills ws2 WHERE ws2.user_id = u.id
          )
        )
      ORDER BY ST_Distance(u.current_location, $1::geography) ASC
      `, [request.location, isGeneral, normalizedSkills, notificationRadiusKm]);
        const targetWorkers = workers.map((worker, index) => ({
            workerId: String(worker.id),
            distanceKm: Number(worker.distance_km ?? 0),
            queuePosition: index + 1,
        }));
        const waveSize = MobileService_1.WORKER_NOTIFICATION_WAVE_SIZE;
        const totalWaves = Math.ceil(targetWorkers.length / waveSize);
        for (let waveIndex = 0; waveIndex < totalWaves; waveIndex += 1) {
            const from = waveIndex * waveSize;
            const to = from + waveSize;
            const waveWorkers = targetWorkers.slice(from, to);
            if (waveWorkers.length === 0) {
                continue;
            }
            if (waveIndex === 0) {
                await this.dispatchWorkerNotificationWave({
                    requestId,
                    category: request.category,
                    title: request.title,
                    budget: Number(request.budget ?? baseBudget),
                    address: request.address,
                    description: request.description,
                    aiCategories: request.aiCategories ?? [],
                    waveWorkers,
                });
                continue;
            }
            const delayMs = waveIndex * MobileService_1.WORKER_NOTIFICATION_WAVE_DELAY_MS;
            setTimeout(() => {
                void this.dispatchWorkerNotificationWave({
                    requestId,
                    category: request.category,
                    title: request.title,
                    budget: Number(request.budget ?? baseBudget),
                    address: request.address,
                    description: request.description,
                    aiCategories: request.aiCategories ?? [],
                    waveWorkers,
                }).catch((error) => {
                    const message = error instanceof Error ? error.message : String(error);
                    this.logger.error(`[request.new] Error enviando ola ${waveIndex + 1} para ${requestId}: ${message}`);
                });
            }, delayMs);
        }
        this.logger.log(`[seedOffers] Solicitud ${requestId}: ${targetWorkers.length} worker(s) en pila por cercania (radioConfigKm=${notificationRadiusKm}, waveSize=${waveSize}, waveDelayMs=${MobileService_1.WORKER_NOTIFICATION_WAVE_DELAY_MS}, skills=${JSON.stringify(normalizedSkills)})`);
        return targetWorkers.length;
    }
    async dispatchWorkerNotificationWave(params) {
        const requestRows = await this.dataSource.query(`
      SELECT status
      FROM job_requests
      WHERE id = $1
      LIMIT 1
      `, [params.requestId]);
        const currentStatus = String(requestRows[0]?.status ?? '');
        if (currentStatus !== 'searching') {
            this.logger.log(`[request.new] Ola cancelada para ${params.requestId}: estado actual ${currentStatus}`);
            return;
        }
        for (const worker of params.waveWorkers) {
            this.logger.log(`[request.new] Notificando worker ${worker.workerId} (${worker.distanceKm.toFixed(1)} km) [posicion ${worker.queuePosition}] solicitud ${params.requestId}`);
            this.realtimeGateway.emitToUser(worker.workerId, 'request.new', {
                requestId: params.requestId,
                category: params.category,
                title: params.title,
                budget: params.budget,
                distanceKm: worker.distanceKm,
                address: params.address,
                description: params.description,
                aiCategories: params.aiCategories,
                queuePosition: worker.queuePosition,
            });
        }
        const workerIds = params.waveWorkers.map((worker) => worker.workerId);
        const tokenRows = await this.dataSource.query(`
      SELECT user_id, token
      FROM push_tokens
      WHERE user_id = ANY($1::uuid[])
      `, [workerIds]);
        const users = tokenRows.map((row) => ({ userId: row.user_id, token: row.token }));
        if (users.length === 0) {
            return;
        }
        const nearestDistance = Math.min(...params.waveWorkers.map((worker) => worker.distanceKm));
        await this.notificationsService.notifyWorkersForJobWave({
            users,
            jobId: params.requestId,
            category: params.category,
            offeredPrice: `Bs ${Math.round(params.budget)}`,
            distanceKm: nearestDistance.toFixed(1),
        });
    }
    async expireStaleOffers(requestId) {
        const rows = await this.dataSource.query(`
      UPDATE job_offers jo
      SET status = 'expired'
      FROM job_requests jr
      WHERE jo.request_id = jr.id
        AND jo.status = 'pending'
        AND jo.expires_at IS NOT NULL
        AND jo.expires_at < NOW()
        AND ($1::uuid IS NULL OR jo.request_id = $1::uuid)
      RETURNING jo.id, jo.request_id, jo.worker_user_id, jr.client_user_id
      `, [requestId ?? null]);
        for (const row of rows) {
            const payload = {
                offerId: row.id,
                requestId: row.request_id,
                workerUserId: row.worker_user_id,
                clientUserId: row.client_user_id,
                status: 'expired',
            };
            this.realtimeGateway.emitToUser(row.worker_user_id, 'offer.expired', payload);
            this.realtimeGateway.emitToUser(row.client_user_id, 'offer.expired', payload);
        }
    }
    async ensureCategoriesExist(values) {
        const sanitized = [
            ...new Set(values.map((item) => item.trim()).filter(Boolean)),
        ].slice(0, 30);
        for (const name of sanitized) {
            const id = this.toCategoryId(name);
            await this.dataSource.query(`
        INSERT INTO categories (id, name, description, is_active)
        VALUES ($1, $2, $3, true)
        ON CONFLICT DO NOTHING
        `, [id, name, `Categoria generada automaticamente: ${name}`]);
            await this.dataSource.query(`
        UPDATE categories
        SET is_active = true,
            updated_at = NOW()
        WHERE id = $1 OR LOWER(name) = LOWER($2)
        `, [id, name]);
        }
    }
    async listDisputes(params) {
        const rows = await this.dataSource.query(`
      SELECT d.id,
             d.request_id,
             d.reported_by,
             d.reported_user,
             d.reason,
             d.description,
             d.status,
             d.resolution,
             d.resolved_by,
             d.resolved_at,
             d.created_at,
             d.updated_at,
             jr.title AS request_title,
             jr.status AS request_status,
             reporter.first_name AS reporter_first_name,
             reporter.last_name AS reporter_last_name,
             reporter.type AS reporter_type,
             reported.first_name AS reported_first_name,
             reported.last_name AS reported_last_name,
             reported.type AS reported_type
      FROM disputes d
      LEFT JOIN job_requests jr ON jr.id = d.request_id
      JOIN users reporter ON reporter.id = d.reported_by
      LEFT JOIN users reported ON reported.id = d.reported_user
      WHERE ($1::text IS NULL OR d.status = $1)
      ORDER BY d.created_at DESC
      LIMIT 500
      `, [params?.status || null]);
        return {
            disputes: rows.map((r) => ({
                id: r.id,
                requestId: r.request_id,
                requestTitle: r.request_title,
                requestStatus: r.request_status,
                reportedBy: r.reported_by,
                reporterName: [r.reporter_first_name, r.reporter_last_name].filter(Boolean).join(' '),
                reporterType: r.reporter_type,
                reportedUser: r.reported_user,
                reportedName: [r.reported_first_name, r.reported_last_name].filter(Boolean).join(' '),
                reportedType: r.reported_type,
                reason: r.reason,
                description: r.description ?? '',
                status: r.status,
                resolution: r.resolution,
                resolvedBy: r.resolved_by,
                resolvedAt: r.resolved_at,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
            })),
        };
    }
    async createDispute(params) {
        if (!params.reportedBy || !params.reason?.trim()) {
            throw new common_1.BadRequestException('El usuario reportante y la razón del reporte son obligatorios.');
        }
        const rows = await this.dataSource.query(`
      INSERT INTO disputes (request_id, reported_by, reported_user, reason, description)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, status, created_at
      `, [
            params.requestId || null,
            params.reportedBy,
            params.reportedUser || null,
            params.reason.trim(),
            params.description?.trim() || null,
        ]);
        if (params.reportedUser) {
            const tokenRows = await this.dataSource.query(`SELECT token AS push_token FROM push_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1`, [params.reportedUser]);
            this.notificationsService.notifyDisputeCreated({
                userId: params.reportedUser,
                token: tokenRows[0]?.push_token || null,
                reason: params.reason,
                disputeId: rows[0].id,
            }).catch(e => this.logger.error('Failed to notify dispute created', e));
        }
        return { dispute: { id: rows[0].id, status: rows[0].status, createdAt: rows[0].created_at } };
    }
    async resolveDispute(params) {
        if (!params.disputeId || !params.resolution?.trim()) {
            throw new common_1.BadRequestException('disputeId and resolution are required');
        }
        await this.dataSource.query(`
      UPDATE disputes
      SET status = 'resolved',
          resolution = $2,
          resolved_by = $3,
          resolved_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      `, [params.disputeId, params.resolution.trim(), params.resolvedBy || 'admin']);
        const disputeRows = await this.dataSource.query(`SELECT reported_by FROM disputes WHERE id = $1 LIMIT 1`, [params.disputeId]);
        if (disputeRows[0]?.reported_by) {
            const userId = disputeRows[0].reported_by;
            const tokenRows = await this.dataSource.query(`SELECT token AS push_token FROM push_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1`, [userId]);
            this.notificationsService.notifyDisputeResolved({
                userId,
                token: tokenRows[0]?.push_token || null,
                resolution: params.resolution,
                disputeId: params.disputeId,
            }).catch(e => this.logger.error('Failed to notify dispute resolved', e));
        }
        return { disputeId: params.disputeId, status: 'resolved' };
    }
    async adminCancelJob(params) {
        const rows = await this.dataSource.query(`SELECT id, title, client_user_id, status FROM job_requests WHERE id = $1 LIMIT 1`, [params.requestId]);
        if (!rows[0])
            throw new common_1.NotFoundException('Request not found');
        const req = rows[0];
        if (req.status === 'completed' || req.status === 'cancelled') {
            throw new common_1.BadRequestException('Cannot cancel a request that is already ' + req.status);
        }
        await this.dataSource.query(`UPDATE job_requests SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [params.requestId]);
        const offerRows = await this.dataSource.query(`SELECT worker_user_id FROM job_offers WHERE request_id = $1 AND status = 'accepted' LIMIT 1`, [params.requestId]);
        if (offerRows[0]?.worker_user_id) {
            await this.dataSource.query(`UPDATE users SET is_available = true, updated_at = NOW() WHERE id = $1`, [offerRows[0].worker_user_id]);
        }
        this.realtimeGateway.server.emit('request.status.updated', {
            requestId: params.requestId,
            status: 'cancelled',
            timestamp: new Date().toISOString(),
        });
        if (req.client_user_id) {
            const clientTokenRows = await this.dataSource.query(`SELECT token AS push_token FROM push_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1`, [req.client_user_id]);
            await this.notificationsService.notifyJobCancelled({
                userId: req.client_user_id,
                token: clientTokenRows[0]?.push_token || null,
                cancelerName: 'Soporte',
                jobTitle: req.title,
                requestId: params.requestId,
            }).catch(e => this.logger.error('Failed to notify client cancel', e));
        }
        if (offerRows[0]?.worker_user_id) {
            const workerTokenRows = await this.dataSource.query(`SELECT token AS push_token FROM push_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1`, [offerRows[0].worker_user_id]);
            await this.notificationsService.notifyJobCancelled({
                userId: offerRows[0].worker_user_id,
                token: workerTokenRows[0]?.push_token || null,
                cancelerName: 'Soporte',
                jobTitle: req.title,
                requestId: params.requestId,
            }).catch(e => this.logger.error('Failed to notify worker cancel', e));
        }
        return { requestId: params.requestId, status: 'cancelled' };
    }
    async getCancellationStats() {
        const rows = await this.dataSource.query(`
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.type,
        COUNT(*)::int AS cancel_count
      FROM job_requests jr
      LEFT JOIN job_offers jo ON jo.request_id = jr.id AND jo.status = 'accepted'
      JOIN users u ON u.id = COALESCE(jo.worker_user_id, jr.client_user_id)
      WHERE jr.status = 'cancelled'
      GROUP BY u.id, u.first_name, u.last_name, u.type
      HAVING COUNT(*) >= 1
      ORDER BY cancel_count DESC
      LIMIT 100
    `);
        return {
            users: rows.map((r) => ({
                id: r.id,
                name: [r.first_name, r.last_name].filter(Boolean).join(' '),
                type: r.type,
                cancelCount: r.cancel_count,
            })),
        };
    }
    async getCommissionConfig() {
        const rows = await this.dataSource.query(`SELECT value_json FROM app_config WHERE key = 'platform_commission' LIMIT 1`);
        if (rows[0]) {
            const val = typeof rows[0].value_json === 'string' ? JSON.parse(rows[0].value_json) : rows[0].value_json;
            return { commissionPercent: Number(val.percent ?? 10) };
        }
        return { commissionPercent: 10 };
    }
    async updateCommissionConfig(params) {
        const percent = Math.min(50, Math.max(0, Number(params.commissionPercent)));
        if (!Number.isFinite(percent)) {
            throw new common_1.BadRequestException('commissionPercent must be a valid number');
        }
        await this.dataSource.query(`
      INSERT INTO app_config (key, value_json, updated_at)
      VALUES ('platform_commission', $1::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()
      `, [JSON.stringify({ percent })]);
        return { commissionPercent: percent };
    }
    async getAiConfig() {
        const rows = await this.dataSource.query(`SELECT value_json FROM app_config WHERE key = 'ai_config' LIMIT 1`);
        const defaultVal = {
            activeProvider: 'nvidia',
            geminiKey: '',
            nvidiaKey: '',
            deepseekKey: '',
        };
        if (rows[0]) {
            const val = typeof rows[0].value_json === 'string' ? JSON.parse(rows[0].value_json) : rows[0].value_json;
            return { ...defaultVal, ...val };
        }
        return defaultVal;
    }
    async updateAiConfig(params) {
        const value = {
            activeProvider: params.activeProvider || 'nvidia',
            geminiKey: params.geminiKey || '',
            nvidiaKey: params.nvidiaKey || '',
            deepseekKey: params.deepseekKey || '',
        };
        await this.dataSource.query(`
      INSERT INTO app_config (key, value_json, updated_at)
      VALUES ('ai_config', $1::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()
      `, [JSON.stringify(value)]);
        return value;
    }
    async updateCategory(params) {
        const sets = [];
        const values = [];
        let idx = 1;
        if (params.name !== undefined) {
            sets.push(`name = $${idx++}`);
            values.push(params.name.trim());
        }
        if (params.description !== undefined) {
            sets.push(`description = $${idx++}`);
            values.push(params.description.trim());
        }
        if (params.icon !== undefined) {
            sets.push(`icon = $${idx++}`);
            values.push(params.icon.trim() || null);
        }
        if (params.active !== undefined) {
            sets.push(`is_active = $${idx++}`);
            values.push(params.active);
        }
        if (sets.length === 0)
            throw new common_1.BadRequestException('No fields to update');
        sets.push(`updated_at = NOW()`);
        values.push(params.id);
        await this.dataSource.query(`UPDATE categories SET ${sets.join(', ')} WHERE id = $${idx}`, values);
        const rows = await this.dataSource.query(`SELECT id, name, description, icon, is_active, parent_id, created_at, updated_at
       FROM categories WHERE id = $1`, [params.id]);
        if (!rows[0])
            throw new common_1.NotFoundException('Category not found');
        return {
            category: {
                id: rows[0].id,
                name: rows[0].name,
                description: rows[0].description ?? '',
                icon: rows[0].icon ?? null,
                parentId: rows[0].parent_id ?? null,
                active: rows[0].is_active,
                createdAt: rows[0].created_at,
                updatedAt: rows[0].updated_at,
            },
        };
    }
    async getDisputeMessages(disputeId, readBy) {
        if (readBy === 'user') {
            await this.dataSource.query(`UPDATE disputes SET user_last_read_at = NOW() WHERE id = $1`, [disputeId]);
        }
        else if (readBy === 'admin') {
            await this.dataSource.query(`UPDATE disputes SET admin_last_read_at = NOW() WHERE id = $1`, [disputeId]);
        }
        const rows = await this.dataSource.query(`
      SELECT dm.id,
             dm.dispute_id,
             dm.sender_type,
             dm.sender_id,
             dm.content,
             dm.created_at,
             u.first_name AS sender_first_name,
             u.last_name AS sender_last_name
      FROM dispute_messages dm
      LEFT JOIN users u ON u.id = dm.sender_id
      WHERE dm.dispute_id = $1
      ORDER BY dm.created_at ASC
      LIMIT 500
      `, [disputeId]);
        return {
            messages: rows.map((r) => ({
                id: r.id,
                disputeId: r.dispute_id,
                senderType: r.sender_type,
                senderId: r.sender_id,
                senderName: [r.sender_first_name, r.sender_last_name].filter(Boolean).join(' ') || 'Soporte',
                content: r.content,
                createdAt: r.created_at,
            })),
        };
    }
    async getUserActiveDisputes(userId) {
        const rows = await this.dataSource.query(`
      SELECT d.id, d.request_id, d.reported_by, d.reported_user, d.reason,
             d.description, d.status, d.resolution, d.resolved_by,
             d.resolved_at, d.created_at, d.updated_at,
             jr.title AS request_title,
             (
               SELECT COUNT(*)::int 
               FROM dispute_messages dm 
               WHERE dm.dispute_id = d.id 
                 AND dm.sender_type = 'admin' 
                 AND (d.user_last_read_at IS NULL OR dm.created_at > d.user_last_read_at)
             ) AS unread_count
      FROM disputes d
      LEFT JOIN job_requests jr ON jr.id = d.request_id
      WHERE d.reported_by = $1
        AND (d.status = 'open' OR (d.status = 'resolved' AND d.resolved_at >= NOW() - INTERVAL '3 days'))
      ORDER BY d.created_at DESC
      LIMIT 100
      `, [userId]);
        return {
            disputes: rows.map((r) => ({
                id: r.id,
                requestId: r.request_id,
                requestTitle: r.request_title,
                reportedBy: r.reported_by,
                reportedUser: r.reported_user,
                reason: r.reason,
                description: r.description,
                status: r.status,
                resolution: r.resolution,
                resolvedBy: r.resolved_by,
                resolvedAt: r.resolved_at,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
                unreadCount: r.unread_count,
            })),
        };
    }
    async sendDisputeMessage(params) {
        if (!params.content?.trim()) {
            throw new common_1.BadRequestException('content is required');
        }
        const rows = await this.dataSource.query(`
      INSERT INTO dispute_messages (dispute_id, sender_type, sender_id, content)
      VALUES ($1, $2, $3, $4)
      RETURNING id, created_at
      `, [
            params.disputeId,
            params.senderType || 'user',
            params.senderId || null,
            params.content.trim(),
        ]);
        this.realtimeGateway.server.emit('dispute.message', {
            disputeId: params.disputeId,
            messageId: rows[0].id,
            senderType: params.senderType,
            timestamp: rows[0].created_at,
        });
        if (params.senderType === 'admin') {
            const disputeRows = await this.dataSource.query(`SELECT reported_by FROM disputes WHERE id = $1 LIMIT 1`, [params.disputeId]);
            const userId = disputeRows[0]?.reported_by;
            if (userId) {
                const tokenRows = await this.dataSource.query(`SELECT token AS push_token FROM push_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1`, [userId]);
                await this.notificationsService.notifySupportMessage({
                    userId,
                    token: tokenRows[0]?.push_token || null,
                    message: params.content,
                }).catch(e => this.logger.error('Failed to notify support message', e));
            }
        }
        return { messageId: rows[0].id, createdAt: rows[0].created_at };
    }
    async deleteCategory(categoryId) {
        await this.dataSource.query(`UPDATE categories SET is_active = false, updated_at = NOW() WHERE id = $1`, [categoryId]);
        return { deleted: true, categoryId };
    }
    async listAllCategories() {
        const rows = await this.dataSource.query(`SELECT id, name, description, icon, parent_id, is_active, created_at, updated_at FROM categories ORDER BY name ASC`);
        return {
            categories: rows.map((row) => ({
                id: row.id,
                name: row.name,
                description: row.description ?? '',
                icon: row.icon ?? null,
                parentId: row.parent_id ?? null,
                active: row.is_active,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            })),
        };
    }
    async getUserDisputes(userId) {
        const madeRows = await this.dataSource.query(`
      SELECT d.id, d.request_id, d.reported_by, d.reported_user, d.reason,
             d.description, d.status, d.resolution, d.resolved_by,
             d.resolved_at, d.created_at, d.updated_at,
             u_by.first_name AS reporter_first_name,
             u_by.last_name AS reporter_last_name,
             u_by.type AS reporter_type,
             u_rep.first_name AS reported_first_name,
             u_rep.last_name AS reported_last_name,
             u_rep.type AS reported_type,
             jr.title AS request_title
      FROM disputes d
      LEFT JOIN users u_by ON u_by.id = d.reported_by
      LEFT JOIN users u_rep ON u_rep.id = d.reported_user
      LEFT JOIN job_requests jr ON jr.id = d.request_id
      WHERE d.reported_by = $1
      ORDER BY d.created_at DESC
      LIMIT 100
      `, [userId]);
        const receivedRows = await this.dataSource.query(`
      SELECT d.id, d.request_id, d.reported_by, d.reported_user, d.reason,
             d.description, d.status, d.resolution, d.resolved_by,
             d.resolved_at, d.created_at, d.updated_at,
             u_by.first_name AS reporter_first_name,
             u_by.last_name AS reporter_last_name,
             u_by.type AS reporter_type,
             u_rep.first_name AS reported_first_name,
             u_rep.last_name AS reported_last_name,
             u_rep.type AS reported_type,
             jr.title AS request_title
      FROM disputes d
      LEFT JOIN users u_by ON u_by.id = d.reported_by
      LEFT JOIN users u_rep ON u_rep.id = d.reported_user
      LEFT JOIN job_requests jr ON jr.id = d.request_id
      WHERE d.reported_user = $1
      ORDER BY d.created_at DESC
      LIMIT 100
      `, [userId]);
        const mapRow = (r) => ({
            id: r.id,
            requestId: r.request_id,
            requestTitle: r.request_title,
            reason: r.reason,
            description: r.description,
            status: r.status,
            resolution: r.resolution,
            resolvedBy: r.resolved_by,
            resolvedAt: r.resolved_at,
            createdAt: r.created_at,
            reporterName: [r.reporter_first_name, r.reporter_last_name].filter(Boolean).join(' '),
            reporterType: r.reporter_type,
            reportedName: [r.reported_first_name, r.reported_last_name].filter(Boolean).join(' '),
            reportedType: r.reported_type,
        });
        return {
            made: madeRows.map(mapRow),
            received: receivedRows.map(mapRow),
        };
    }
};
exports.MobileService = MobileService;
exports.MobileService = MobileService = MobileService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        typeorm_1.DataSource,
        storage_service_1.StorageService,
        notifications_service_1.NotificationsService,
        realtime_gateway_1.RealtimeGateway])
], MobileService);
//# sourceMappingURL=mobile.service.js.map