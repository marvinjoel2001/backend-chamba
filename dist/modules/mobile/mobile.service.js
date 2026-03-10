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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MobileService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
let MobileService = class MobileService {
    dataSource;
    constructor(dataSource) {
        this.dataSource = dataSource;
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
        const phone = input.phone?.trim() || null;
        const lastName = input.lastName?.trim() || null;
        return this.dataSource.transaction(async (manager) => {
            const existing = await manager.query(`
        SELECT id
        FROM users
        WHERE LOWER(email) = LOWER($1)
           OR ($2::text IS NOT NULL AND phone = $2)
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
        RETURNING id, type, first_name, last_name, email, phone, profile_photo_url
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
                },
            };
        });
    }
    async login(identifier, password) {
        if (!identifier?.trim() || !password?.trim()) {
            throw new common_1.BadRequestException('identifier and password are required');
        }
        const rows = await this.dataSource.query(`
      SELECT u.id,
             u.type,
             u.first_name,
             u.last_name,
             u.email,
             u.phone,
             u.profile_photo_url
      FROM users u
      JOIN auth_credentials c ON c.user_id = u.id
      WHERE (LOWER(u.email) = LOWER($1) OR u.phone = $1)
        AND c.password = $2
      LIMIT 1
      `, [identifier.trim(), password.trim()]);
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
            },
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
      `, [params.userId, params.latitude ?? null, params.longitude ?? null, radiusKm]);
        const activeRequest = await this.findLatestClientRequest(user.id);
        return {
            user,
            categories: this.extractTopCategories(workerRows),
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
    async createRequest(input) {
        if (!input.clientUserId) {
            throw new common_1.BadRequestException('clientUserId is required');
        }
        if (!input.title || !input.description || !input.category || !input.address) {
            throw new common_1.BadRequestException('title, description, category and address are required');
        }
        if (!Number.isFinite(input.budget) || input.budget <= 0) {
            throw new common_1.BadRequestException('budget must be greater than 0');
        }
        if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
            throw new common_1.BadRequestException('latitude and longitude are required');
        }
        await this.getUserById(input.clientUserId);
        const rows = await this.dataSource.query(`
      INSERT INTO job_requests (
        client_user_id,
        title,
        description,
        category,
        budget,
        price_type,
        scheduled_at,
        location,
        address,
        status
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        ST_SetSRID(ST_MakePoint($9::float8, $8::float8), 4326)::geography,
        $10,
        'searching'
      )
      RETURNING id, status, title, budget, address, created_at
      `, [
            input.clientUserId,
            input.title,
            input.description,
            input.category,
            input.budget,
            input.priceType,
            input.scheduledAt ?? null,
            input.latitude,
            input.longitude,
            input.address,
        ]);
        const created = rows[0];
        const notifiedWorkers = await this.seedOffersForRequest(created.id, input.budget);
        return {
            request: {
                id: created.id,
                status: created.status,
                title: created.title,
                budget: Number(created.budget),
                address: created.address,
                createdAt: created.created_at,
            },
            notifiedWorkers,
        };
    }
    async getRequestStatus(params) {
        const request = await this.resolveRequest(params);
        const metricRows = await this.dataSource.query(`
      SELECT
        COUNT(*)::text AS offers_count,
        COUNT(*) FILTER (WHERE jo.status = 'accepted')::text AS accepted_count,
        MIN(
          CASE
            WHEN u.current_location IS NOT NULL
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
      ORDER BY jo.amount ASC, u.average_rating DESC
      LIMIT 3
      `, [request.id]);
        const metrics = metricRows[0] ?? {};
        const nearestKm = metrics.nearest_worker_km == null ? null : Number(metrics.nearest_worker_km);
        return {
            request,
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
        const rows = await this.dataSource.query(`
      WITH skill_agg AS (
        SELECT ws.user_id, array_agg(ws.skill ORDER BY ws.skill) AS skills
        FROM worker_skills ws
        GROUP BY ws.user_id
      )
      SELECT jo.id AS offer_id,
             jo.amount,
             jo.status,
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
      ORDER BY jo.amount ASC, u.average_rating DESC
      `, [request.id]);
        return {
            request,
            offers: rows.map((row) => ({
                id: row.offer_id,
                amount: Number(row.amount),
                status: row.status,
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
                gallery: [
                    'https://images.unsplash.com/photo-1506744038136-46273834b3fb',
                    'https://images.unsplash.com/photo-1513694203232-719a280e022f',
                    'https://images.unsplash.com/photo-1472224371017-08207f84aaae',
                ],
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
             CASE WHEN t.client_user_id = $1 THEN t.worker_user_id ELSE t.client_user_id END AS counterpart_id,
             u.first_name AS counterpart_first_name,
             u.last_name AS counterpart_last_name,
             u.profile_photo_url AS counterpart_photo,
             lm.content AS last_message,
             lm.created_at AS last_message_at
      FROM chat_threads t
      JOIN users u
        ON u.id = CASE WHEN t.client_user_id = $1 THEN t.worker_user_id ELSE t.client_user_id END
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
    async getThreadMessages(threadId) {
        await this.ensureThreadExists(threadId);
        const rows = await this.dataSource.query(`
      SELECT id, sender_user_id, content, created_at
      FROM chat_messages
      WHERE thread_id = $1
      ORDER BY created_at ASC
      `, [threadId]);
        return {
            threadId,
            messages: rows.map((row) => ({
                id: row.id,
                senderUserId: row.sender_user_id,
                content: row.content,
                createdAt: row.created_at,
            })),
        };
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
        return {
            message: {
                id: rows[0].id,
                senderUserId: rows[0].sender_user_id,
                content: rows[0].content,
                createdAt: rows[0].created_at,
            },
        };
    }
    async getIncomingRequest(workerUserId) {
        await this.getUserById(workerUserId);
        const rows = await this.dataSource.query(`
      SELECT jr.id AS request_id,
             jr.title,
             jr.description,
             jr.category,
             jr.budget,
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
             jo.id AS offer_id,
             jo.amount AS offer_amount
      FROM job_requests jr
      JOIN users w ON w.id = $1
      JOIN users c ON c.id = jr.client_user_id
      LEFT JOIN job_offers jo ON jo.request_id = jr.id AND jo.worker_user_id = $1
      WHERE jr.status IN ('searching', 'negotiating')
        AND jr.client_user_id <> $1
      ORDER BY distance_km ASC NULLS LAST, jr.created_at DESC
      LIMIT 1
      `, [workerUserId]);
        const row = rows[0];
        if (!row) {
            return { request: null };
        }
        return {
            request: {
                id: row.request_id,
                title: row.title,
                description: row.description,
                category: row.category,
                budget: Number(row.budget),
                address: row.address,
                status: row.status,
                distanceKm: row.distance_km == null ? null : Number(row.distance_km),
                client: {
                    id: row.client_id,
                    name: `${row.client_first_name} ${row.client_last_name ?? ''}`.trim(),
                },
                workerOffer: row.offer_id
                    ? { id: row.offer_id, amount: Number(row.offer_amount ?? 0) }
                    : null,
            },
        };
    }
    async upsertOffer(params) {
        if (!Number.isFinite(params.amount) || params.amount <= 0) {
            throw new common_1.BadRequestException('amount must be greater than 0');
        }
        await this.getUserById(params.workerUserId);
        const request = await this.getRequestById(params.requestId);
        const existingRows = await this.dataSource.query(`
      SELECT id
      FROM job_offers
      WHERE request_id = $1 AND worker_user_id = $2
      LIMIT 1
      `, [params.requestId, params.workerUserId]);
        let offerId = '';
        if (existingRows[0]) {
            const rows = await this.dataSource.query(`
        UPDATE job_offers
        SET amount = $2,
            message = $3,
            status = 'pending',
            created_at = NOW()
        WHERE id = $1
        RETURNING id
        `, [existingRows[0].id, params.amount, params.message ?? null]);
            offerId = rows[0].id;
        }
        else {
            const rows = await this.dataSource.query(`
        INSERT INTO job_offers (request_id, worker_user_id, amount, message, status)
        VALUES ($1, $2, $3, $4, 'pending')
        RETURNING id
        `, [params.requestId, params.workerUserId, params.amount, params.message ?? null]);
            offerId = rows[0].id;
        }
        await this.dataSource.query(`
      UPDATE job_requests
      SET status = CASE WHEN status = 'searching' THEN 'negotiating' ELSE status END,
          updated_at = NOW()
      WHERE id = $1
      `, [params.requestId]);
        await this.ensureThreadAndInitialMessage({
            requestId: params.requestId,
            clientUserId: request.client_user_id,
            workerUserId: params.workerUserId,
            introMessage: params.message?.trim() ||
                `Hola, puedo ayudarte por Bs ${Math.round(params.amount)}. Estoy disponible.`,
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
    async acceptOffer(params) {
        const rows = await this.dataSource.query(`
      SELECT jo.id,
             jo.request_id,
             jo.worker_user_id,
             jr.client_user_id
      FROM job_offers jo
      JOIN job_requests jr ON jr.id = jo.request_id
      WHERE jo.id = $1
      LIMIT 1
      `, [params.offerId]);
        const offer = rows[0];
        if (!offer) {
            throw new common_1.NotFoundException('Offer not found');
        }
        if (offer.client_user_id !== params.clientUserId) {
            throw new common_1.UnauthorizedException('Solo el cliente puede aceptar la oferta');
        }
        await this.dataSource.query(`UPDATE job_offers SET status = 'rejected' WHERE request_id = $1`, [offer.request_id]);
        await this.dataSource.query(`UPDATE job_offers SET status = 'accepted' WHERE id = $1`, [params.offerId]);
        await this.dataSource.query(`UPDATE job_requests SET status = 'assigned', updated_at = NOW() WHERE id = $1`, [offer.request_id]);
        return {
            accepted: true,
            requestId: offer.request_id,
            workerUserId: offer.worker_user_id,
        };
    }
    async getTracking(requestId) {
        const rows = await this.dataSource.query(`
      SELECT jr.id AS request_id,
             jr.address AS request_address,
             w.id AS worker_id,
             w.first_name AS worker_first_name,
             w.last_name AS worker_last_name,
             w.profile_photo_url AS worker_photo,
             CASE
               WHEN w.current_location IS NOT NULL
                 THEN ST_Distance(w.current_location, jr.location) / 1000.0
               ELSE NULL
             END AS distance_km,
             jo.amount
      FROM job_requests jr
      JOIN job_offers jo ON jo.request_id = jr.id AND jo.status = 'accepted'
      JOIN users w ON w.id = jo.worker_user_id
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
            address: row.request_address,
            distanceKm,
            etaMinutes: distanceKm == null ? null : Math.max(5, Math.ceil(distanceKm / 0.5)),
            agreedAmount: Number(row.amount),
            worker: {
                id: row.worker_id,
                firstName: row.worker_first_name,
                lastName: row.worker_last_name ?? '',
                profilePhotoUrl: row.worker_photo ?? null,
            },
        };
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
            summary: {
                jobsToday: Number(rows[0]?.jobs_today ?? 0),
                earningsToday: Number(rows[0]?.earnings_today ?? 0),
                nearbyRequests: Number(rows[0]?.nearby_requests ?? 0),
            },
            skills: skills.skills,
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
    async getWorkerSkills(workerUserId) {
        await this.getUserById(workerUserId);
        const rows = await this.dataSource.query(`SELECT skill FROM worker_skills WHERE user_id = $1 ORDER BY skill ASC`, [workerUserId]);
        return {
            workerUserId,
            skills: rows.map((row) => row.skill),
        };
    }
    async updateWorkerSkills(workerUserId, skills) {
        await this.getUserById(workerUserId);
        const sanitized = [...new Set((skills ?? []).map((item) => item.trim()).filter(Boolean))].slice(0, 20);
        await this.dataSource.query(`DELETE FROM worker_skills WHERE user_id = $1`, [workerUserId]);
        for (const skill of sanitized) {
            await this.dataSource.query(`INSERT INTO worker_skills (user_id, skill) VALUES ($1, $2)`, [workerUserId, skill]);
        }
        return {
            workerUserId,
            skills: sanitized,
        };
    }
    async createReview(params) {
        if (!Number.isInteger(params.stars) || params.stars < 1 || params.stars > 5) {
            throw new common_1.BadRequestException('stars must be between 1 and 5');
        }
        await this.getUserById(params.workerUserId);
        await this.getUserById(params.clientUserId);
        await this.getRequestById(params.requestId);
        await this.dataSource.query(`
      INSERT INTO worker_reviews (request_id, worker_user_id, client_user_id, stars, comment)
      VALUES ($1, $2, $3, $4, $5)
      `, [params.requestId, params.workerUserId, params.clientUserId, params.stars, params.comment ?? null]);
        const rows = await this.dataSource.query(`
      SELECT COALESCE(AVG(stars), 0) AS average_rating,
             COUNT(*)::text AS completed_jobs
      FROM worker_reviews
      WHERE worker_user_id = $1
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
            `
      CREATE TABLE IF NOT EXISTS auth_credentials (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        password TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      `,
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
            `
      CREATE TABLE IF NOT EXISTS job_offers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id UUID NOT NULL REFERENCES job_requests(id) ON DELETE CASCADE,
        worker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount NUMERIC(12,2) NOT NULL,
        message TEXT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (request_id, worker_user_id)
      );
      `,
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
            `CREATE INDEX IF NOT EXISTS idx_job_requests_location ON job_requests USING GIST(location);`,
            `CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created ON chat_messages(thread_id, created_at DESC);`,
            `CREATE INDEX IF NOT EXISTS idx_job_offers_request ON job_offers(request_id);`,
        ];
        for (const statement of statements) {
            await this.dataSource.query(statement);
        }
    }
    async seedData() {
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
            await this.acceptOffer({ offerId: firstOffer.id, clientUserId: clientId });
        }
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
      SELECT id,
             client_user_id,
             title,
             description,
             category,
             budget,
             price_type,
             address,
             status,
             created_at
      FROM job_requests
      WHERE client_user_id = $1
      ORDER BY created_at DESC
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
            budget: Number(row.budget),
            priceType: row.price_type,
            address: row.address,
            status: row.status,
            createdAt: row.created_at,
        };
    }
    async getRequestById(requestId) {
        const rows = await this.dataSource.query(`
      SELECT id,
             client_user_id,
             title,
             description,
             category,
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
             is_available
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
            isAvailable: row.is_available,
        };
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
        const workers = await this.dataSource.query(`
      SELECT u.id
      FROM users u
      WHERE u.type = 'worker'
        AND u.is_available = true
        AND u.current_location IS NOT NULL
        AND ST_DWithin(u.current_location, $1::geography, u.work_radius_km * 1000)
      ORDER BY ST_Distance(u.current_location, $1::geography) ASC
      LIMIT 5
      `, [request.location]);
        for (let index = 0; index < workers.length; index += 1) {
            const worker = workers[index];
            const multiplier = 0.95 + index * 0.06;
            const amount = Math.round(baseBudget * multiplier);
            await this.upsertOffer({
                requestId,
                workerUserId: worker.id,
                amount,
                message: `Hola, puedo comenzar hoy mismo. Oferta inicial Bs ${amount}.`,
            });
        }
        return workers.length;
    }
};
exports.MobileService = MobileService;
exports.MobileService = MobileService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], MobileService);
//# sourceMappingURL=mobile.service.js.map