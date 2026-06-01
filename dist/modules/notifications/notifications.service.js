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
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const push_service_1 = require("../../infrastructure/push/push.service");
let NotificationsService = class NotificationsService {
    pushService;
    constructor(pushService) {
        this.pushService = pushService;
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
        return this.pushService.sendToTokens({
            tokens: params.tokens,
            title: `📍 Trabajo nuevo cerca: ${params.category}`,
            body: `Tienes una solicitud ${params.offeredPrice} a ${params.distanceKm} km. Toca para revisar.`,
            data: {
                type: 'request_new',
                jobId: params.jobId,
            },
        });
    }
    async notifyClientNewOffer(params) {
        return this.pushService.sendToToken({
            token: params.token,
            title: `💰 ${params.workerName} ofertó Bs ${params.amount}`,
            body: `En tu solicitud: ${params.jobTitle}`,
            data: {
                type: 'offer_new',
                requestId: params.requestId,
            },
        });
    }
    async notifyWorkerOfferAccepted(params) {
        return this.pushService.sendToToken({
            token: params.token,
            title: `✅ ¡Oferta aceptada!`,
            body: `${params.clientName} aceptó tu oferta en: ${params.jobTitle}`,
            data: {
                type: 'offer_accepted',
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
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [push_service_1.PushService])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map