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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var NotificationsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsService = void 0;
const crypto_1 = require("crypto");
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const push_service_1 = require("../../infrastructure/push/push.service");
const notification_entity_1 = require("./entities/notification.entity");
let NotificationsService = NotificationsService_1 = class NotificationsService {
    pushService;
    notificationRepository;
    logger = new common_1.Logger(NotificationsService_1.name);
    constructor(pushService, notificationRepository) {
        this.pushService = pushService;
        this.notificationRepository = notificationRepository;
    }
    isPushEnabled() {
        return this.pushService.isEnabled();
    }
    getProjectId() {
        return this.pushService.getProjectId();
    }
    async sendTestPush(payload) {
        const enabled = this.pushService.isEnabled();
        const messageId = await this.pushService.sendToToken({
            token: payload.token,
            title: payload.title ?? 'Chamba',
            body: payload.body ?? 'Notificacion de prueba desde backend',
            data: {
                type: 'test',
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
            },
        });
        return {
            enabled,
            messageId,
        };
    }
    async broadcastPush(params) {
        if (params.tokens.length === 0)
            return 0;
        return this.pushService.sendToTokens({
            tokens: params.tokens,
            title: params.title,
            body: params.body,
            data: {
                type: params.isCallAlert ? 'request_new' : 'broadcast',
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
            },
        });
    }
    async simulateJobWavePush(params) {
        if (params.tokens.length === 0)
            return 0;
        const jobId = (0, crypto_1.randomUUID)();
        return this.pushService.sendToTokens({
            tokens: params.tokens,
            title: '📍 Trabajo nuevo cerca: Prueba',
            body: 'Tienes una solicitud de Bs 150 a 1.2 km. Toca para revisar.',
            data: {
                type: 'request_new',
                jobId,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                deep_link: `/request/${jobId}`,
            },
        });
    }
    async notifyWorkersForJobWave(params) {
        const title = `📍 Trabajo nuevo cerca: ${params.category}`;
        const body = `Tienes una solicitud ${params.offeredPrice} a ${params.distanceKm} km. Toca para revisar.`;
        const type = 'request_new';
        const uniqueUserIds = [...new Set(params.users.map((u) => u.userId))];
        const notifications = uniqueUserIds.map((userId) => this.notificationRepository.create({
            userId,
            title,
            body,
            type,
            data: { jobId: params.jobId, deep_link: `/request/${params.jobId}` },
        }));
        if (notifications.length > 0) {
            await this.notificationRepository.save(notifications);
        }
        const tokens = params.users.map((u) => u.token).filter(Boolean);
        return this.pushService.sendToTokens({
            tokens,
            title,
            body,
            data: {
                type,
                jobId: params.jobId,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                deep_link: `/request/${params.jobId}`,
            },
        });
    }
    async notifyClientNewOffer(params) {
        const title = `💰 ${params.workerName} ofertó Bs ${params.amount}`;
        const body = `En tu solicitud: ${params.jobTitle}`;
        const type = 'offer_new';
        await this.notificationRepository.save(this.notificationRepository.create({
            userId: params.userId,
            title,
            body,
            type,
            data: {
                requestId: params.requestId,
                deep_link: `/request/${params.requestId}`,
            },
        }));
        return this.pushService.sendToToken({
            token: params.token,
            title,
            body,
            data: {
                type,
                requestId: params.requestId,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                deep_link: `/request/${params.requestId}`,
            },
        });
    }
    async notifyWorkerOfferAccepted(params) {
        const title = `✅ ¡Oferta aceptada!`;
        const body = `${params.clientName} aceptó tu oferta en: ${params.jobTitle}`;
        const type = 'offer_accepted';
        await this.notificationRepository.save(this.notificationRepository.create({
            userId: params.userId,
            title,
            body,
            type,
            data: {
                requestId: params.requestId,
                deep_link: `/request/${params.requestId}`,
            },
        }));
        return this.pushService.sendToToken({
            token: params.token,
            title,
            body,
            data: {
                type,
                requestId: params.requestId,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                deep_link: `/request/${params.requestId}`,
            },
        });
    }
    async notifyNewMessage(params) {
        const title = params.title || `💬 ${params.senderName || 'Mensaje nuevo'}`;
        const rawBody = params.body || params.message || 'Te ha enviado un mensaje';
        const body = rawBody.length > 80 ? rawBody.substring(0, 77) + '...' : rawBody;
        return this.pushService.sendToToken({
            token: params.token,
            title,
            body,
            data: {
                type: 'message_new',
                threadId: params.threadId,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                deep_link: `/chat/${params.threadId}`,
            },
        });
    }
    async notifyWorkerArrived(params) {
        const title = `📍 ${params.workerName} ha llegado`;
        const body = `El trabajador llegó a tu ubicación para: ${params.jobTitle}`;
        const type = 'worker_arrived';
        await this.notificationRepository.save(this.notificationRepository.create({
            userId: params.userId,
            title,
            body,
            type,
            data: {
                requestId: params.requestId,
                deep_link: `/request/${params.requestId}`,
            },
        }));
        return this.pushService.sendToToken({
            token: params.token,
            title,
            body,
            data: {
                type,
                requestId: params.requestId,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                deep_link: `/request/${params.requestId}`,
            },
        });
    }
    async notifyJobFinished(params) {
        const title = `🏁 Trabajo finalizado`;
        const body = `${params.workerName} marcó como terminado: ${params.jobTitle}`;
        const type = 'job_finished';
        await this.notificationRepository.save(this.notificationRepository.create({
            userId: params.userId,
            title,
            body,
            type,
            data: {
                requestId: params.requestId,
                deep_link: `/request/${params.requestId}`,
            },
        }));
        return this.pushService.sendToToken({
            token: params.token,
            title,
            body,
            data: {
                type,
                requestId: params.requestId,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                deep_link: `/request/${params.requestId}`,
            },
        });
    }
    async notifyJobCancelled(params) {
        const title = `❌ Trabajo Cancelado`;
        const body = `${params.cancelerName} canceló el trabajo: ${params.jobTitle}`;
        const type = 'job_cancelled';
        await this.notificationRepository.save(this.notificationRepository.create({
            userId: params.userId,
            title,
            body,
            type,
            data: {
                requestId: params.requestId,
                deep_link: `/request/${params.requestId}`,
            },
        }));
        if (!params.token)
            return null;
        return this.pushService.sendToToken({
            token: params.token,
            title,
            body,
            data: {
                type,
                requestId: params.requestId,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                deep_link: `/request/${params.requestId}`,
            },
        });
    }
    async notifySupportMessage(params) {
        const title = `🎧 Soporte Chamba`;
        const body = params.message.length > 60
            ? params.message.substring(0, 60) + '...'
            : params.message;
        const type = 'support_message';
        await this.notificationRepository.save(this.notificationRepository.create({
            userId: params.userId,
            title,
            body,
            type,
            data: { deep_link: `/support` },
        }));
        if (!params.token)
            return null;
        return this.pushService.sendToToken({
            token: params.token,
            title,
            body,
            data: {
                type,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                deep_link: `/support`,
            },
        });
    }
    async notifyVerificationUpdated(params) {
        const title = params.status === 'verified'
            ? `✅ Cuenta Verificada`
            : `⚠️ Problema con tu verificación`;
        const body = params.message;
        const type = 'verification_update';
        await this.notificationRepository.save(this.notificationRepository.create({
            userId: params.userId,
            title,
            body,
            type,
            data: { deep_link: `/profile` },
        }));
        if (!params.token)
            return null;
        return this.pushService.sendToToken({
            token: params.token,
            title,
            body,
            data: {
                type,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                deep_link: `/profile`,
            },
        });
    }
    async notifyWorkerCounterOffer(params) {
        const title = `💰 ¡${params.clientName} mejoró su oferta!`;
        const body = `Nuevo presupuesto: Bs ${Math.round(params.newAmount)} en ${params.jobTitle}`;
        const type = 'counter_offer';
        await this.notificationRepository.save(this.notificationRepository.create({
            userId: params.userId,
            title,
            body,
            type,
            data: {
                requestId: params.requestId,
                deep_link: `/request/${params.requestId}`,
            },
        }));
        if (!params.token)
            return null;
        return this.pushService.sendToToken({
            token: params.token,
            title,
            body,
            data: {
                type,
                requestId: params.requestId,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                deep_link: `/request/${params.requestId}`,
            },
        });
    }
    async notifyOfferRejected(params) {
        const title = `😔 Oferta no seleccionada`;
        const body = `El cliente eligió a otro trabajador para: ${params.jobTitle}`;
        const type = 'offer_rejected';
        await this.notificationRepository.save(this.notificationRepository.create({
            userId: params.userId,
            title,
            body,
            type,
            data: {
                requestId: params.requestId,
                deep_link: `/request/${params.requestId}`,
            },
        }));
        if (!params.token)
            return null;
        return this.pushService.sendToToken({
            token: params.token,
            title,
            body,
            data: {
                type,
                requestId: params.requestId,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                deep_link: `/request/${params.requestId}`,
            },
        });
    }
    async notifyWorkerAgencyOffer(params) {
        const title = `🏢 ${params.agencyName} te postuló a un trabajo`;
        const body = `Oferta de Bs ${params.amount} en: ${params.jobTitle}`;
        const type = 'agency_offer_sent';
        await this.notificationRepository.save(this.notificationRepository.create({
            userId: params.userId,
            title,
            body,
            type,
            data: {
                requestId: params.requestId,
                deep_link: `/request/${params.requestId}`,
            },
        }));
        if (!params.token)
            return null;
        return this.pushService.sendToToken({
            token: params.token,
            title,
            body,
            data: {
                type,
                requestId: params.requestId,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                deep_link: `/request/${params.requestId}`,
            },
        });
    }
    async notifyNewReview(params) {
        const starsEmoji = '⭐'.repeat(Math.min(params.stars, 5));
        const title = `${starsEmoji} Nueva calificación`;
        const body = `${params.clientName} te calificó con ${params.stars} estrellas en: ${params.jobTitle}`;
        const type = 'new_review';
        await this.notificationRepository.save(this.notificationRepository.create({
            userId: params.userId,
            title,
            body,
            type,
            data: {
                requestId: params.requestId,
                stars: params.stars,
                deep_link: `/profile`,
            },
        }));
        if (!params.token)
            return null;
        return this.pushService.sendToToken({
            token: params.token,
            title,
            body,
            data: {
                type,
                requestId: params.requestId,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                deep_link: `/profile`,
            },
        });
    }
    async notifyClientConfirmedArrival(params) {
        const title = `✅ Llegada confirmada`;
        const body = `${params.clientName} confirmó tu llegada. Ya puedes iniciar: ${params.jobTitle}`;
        const type = 'arrival_confirmed';
        await this.notificationRepository.save(this.notificationRepository.create({
            userId: params.userId,
            title,
            body,
            type,
            data: {
                requestId: params.requestId,
                deep_link: `/request/${params.requestId}`,
            },
        }));
        if (!params.token)
            return null;
        return this.pushService.sendToToken({
            token: params.token,
            title,
            body,
            data: {
                type,
                requestId: params.requestId,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                deep_link: `/request/${params.requestId}`,
            },
        });
    }
    async notifyDisputeResolved(params) {
        const title = `📋 Tu queja fue resuelta`;
        const body = params.resolution.length > 80
            ? params.resolution.substring(0, 80) + '...'
            : params.resolution;
        const type = 'dispute_resolved';
        await this.notificationRepository.save(this.notificationRepository.create({
            userId: params.userId,
            title,
            body,
            type,
            data: { disputeId: params.disputeId, deep_link: `/support` },
        }));
        if (!params.token)
            return null;
        return this.pushService.sendToToken({
            token: params.token,
            title,
            body,
            data: {
                type,
                disputeId: params.disputeId,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                deep_link: `/support`,
            },
        });
    }
    async notifyDisputeCreated(params) {
        const title = `⚠️ Se abrió una queja`;
        const body = `Motivo: ${params.reason.length > 60 ? params.reason.substring(0, 60) + '...' : params.reason}`;
        const type = 'dispute_created';
        await this.notificationRepository.save(this.notificationRepository.create({
            userId: params.userId,
            title,
            body,
            type,
            data: { disputeId: params.disputeId, deep_link: `/support` },
        }));
        if (!params.token)
            return null;
        return this.pushService.sendToToken({
            token: params.token,
            title,
            body,
            data: {
                type,
                disputeId: params.disputeId,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                deep_link: `/support`,
            },
        });
    }
    async notifyClientToImproveOffer(params) {
        const title = `⚠️ Nadie ha aceptado tu solicitud aún`;
        const body = `Sube tu presupuesto en: ${params.jobTitle} para atraer más trabajadores.`;
        const type = 'improve_offer_reminder';
        await this.notificationRepository.save(this.notificationRepository.create({
            userId: params.userId,
            title,
            body,
            type,
            data: {
                requestId: params.requestId,
                deep_link: `/request/${params.requestId}`,
            },
        }));
        if (!params.token)
            return null;
        return this.pushService.sendToToken({
            token: params.token,
            title,
            body,
            data: {
                type,
                requestId: params.requestId,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                deep_link: `/request/${params.requestId}`,
            },
        });
    }
    async notifyClientTimeout(params) {
        const title = `⏱️ Solicitud expirada`;
        const body = `Tu solicitud ${params.jobTitle} se ha cancelado por falta de trabajadores disponibles.`;
        const type = 'request_timeout';
        await this.notificationRepository.save(this.notificationRepository.create({
            userId: params.userId,
            title,
            body,
            type,
            data: {
                requestId: params.requestId,
                deep_link: `/request/${params.requestId}`,
            },
        }));
        if (!params.token)
            return null;
        return this.pushService.sendToToken({
            token: params.token,
            title,
            body,
            data: {
                type,
                requestId: params.requestId,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                deep_link: `/request/${params.requestId}`,
            },
        });
    }
    async notifyRequestClosed(params) {
        const title = `🚫 Solicitud ya no disponible`;
        const body = `La solicitud "${params.jobTitle}" se cerró antes de elegir tu oferta.`;
        const type = 'request_closed';
        await this.notificationRepository.save(this.notificationRepository.create({
            userId: params.userId,
            title,
            body,
            type,
            data: {
                requestId: params.requestId,
                deep_link: `/request/${params.requestId}`,
            },
        }));
        if (!params.token)
            return null;
        return this.pushService.sendToToken({
            token: params.token,
            title,
            body,
            data: {
                type,
                requestId: params.requestId,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                deep_link: `/request/${params.requestId}`,
            },
        });
    }
    async notifyWorkerJobStartingSoon(params) {
        const title = `🕐 Tu trabajo empieza ${params.startsInLabel}`;
        const body = `Prepárate para: ${params.jobTitle}. Revisa la dirección y llega a tiempo.`;
        const type = 'job_starting_soon';
        await this.notificationRepository.save(this.notificationRepository.create({
            userId: params.userId,
            title,
            body,
            type,
            data: {
                requestId: params.requestId,
                deep_link: `/request/${params.requestId}`,
            },
        }));
        if (!params.token)
            return null;
        return this.pushService.sendToToken({
            token: params.token,
            title,
            body,
            data: {
                type,
                requestId: params.requestId,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                deep_link: `/request/${params.requestId}`,
            },
        });
    }
    async notifyClientJobStartingSoon(params) {
        const title = `🕐 Tu trabajo empieza ${params.startsInLabel}`;
        const body = `${params.workerName} llegará pronto para: ${params.jobTitle}`;
        const type = 'job_starting_soon';
        await this.notificationRepository.save(this.notificationRepository.create({
            userId: params.userId,
            title,
            body,
            type,
            data: {
                requestId: params.requestId,
                deep_link: `/request/${params.requestId}`,
            },
        }));
        if (!params.token)
            return null;
        return this.pushService.sendToToken({
            token: params.token,
            title,
            body,
            data: {
                type,
                requestId: params.requestId,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                deep_link: `/request/${params.requestId}`,
            },
        });
    }
    async getUserNotifications(userId, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const [items, total] = await this.notificationRepository.findAndCount({
            where: { userId },
            order: { createdAt: 'DESC' },
            take: limit,
            skip,
        });
        return {
            items,
            hasMore: skip + items.length < total,
        };
    }
    async getUnreadCount(userId) {
        return this.notificationRepository.count({
            where: { userId, isRead: false },
        });
    }
    async markNotificationsAsRead(userId) {
        await this.notificationRepository.update({ userId, isRead: false }, { isRead: true });
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = NotificationsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, typeorm_1.InjectRepository)(notification_entity_1.Notification)),
    __metadata("design:paramtypes", [push_service_1.PushService,
        typeorm_2.Repository])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map