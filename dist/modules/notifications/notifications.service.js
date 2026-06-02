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
    async sendTestPush(payload) {
        const enabled = this.pushService.isEnabled();
        const messageId = await this.pushService.sendToToken({
            token: payload.token,
            title: payload.title ?? 'Chamba',
            body: payload.body ?? 'Notificacion de prueba desde backend',
            data: {
                type: 'test',
            },
        });
        return {
            enabled,
            messageId,
        };
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
            data: { jobId: params.jobId },
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
            data: { requestId: params.requestId },
        }));
        return this.pushService.sendToToken({
            token: params.token,
            title,
            body,
            data: {
                type,
                requestId: params.requestId,
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
            data: { requestId: params.requestId },
        }));
        return this.pushService.sendToToken({
            token: params.token,
            title,
            body,
            data: {
                type,
                requestId: params.requestId,
            },
        });
    }
    async notifyNewMessage(params) {
        return this.pushService.sendToToken({
            token: params.token,
            title: `💬 ${params.senderName}`,
            body: params.message.length > 60 ? params.message.substring(0, 60) + '...' : params.message,
            data: {
                type: 'message_new',
                threadId: params.threadId,
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
            data: { requestId: params.requestId },
        }));
        return this.pushService.sendToToken({
            token: params.token,
            title,
            body,
            data: { type, requestId: params.requestId },
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
            data: { requestId: params.requestId },
        }));
        return this.pushService.sendToToken({
            token: params.token,
            title,
            body,
            data: { type, requestId: params.requestId },
        });
    }
    async getUserNotifications(userId) {
        return this.notificationRepository.find({
            where: { userId },
            order: { createdAt: 'DESC' },
            take: 50,
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