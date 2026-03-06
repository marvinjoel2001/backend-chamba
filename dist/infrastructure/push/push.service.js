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
var PushService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PushService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const app_1 = require("firebase-admin/app");
const messaging_1 = require("firebase-admin/messaging");
let PushService = PushService_1 = class PushService {
    configService;
    logger = new common_1.Logger(PushService_1.name);
    app;
    messaging;
    constructor(configService) {
        this.configService = configService;
        const privateKey = this.normalizePrivateKey(this.configService.get('FIREBASE_PRIVATE_KEY'));
        const projectId = this.configService.get('FIREBASE_PROJECT_ID');
        const clientEmail = this.configService.get('FIREBASE_CLIENT_EMAIL');
        if (!privateKey || !projectId || !clientEmail) {
            this.logger.warn('Firebase push disabled: missing FIREBASE_* environment variables.');
            this.app = null;
            this.messaging = null;
            return;
        }
        const existing = (0, app_1.getApps)().find((currentApp) => currentApp.name === 'chamba');
        this.app =
            existing ||
                (0, app_1.initializeApp)({
                    credential: (0, app_1.cert)({
                        projectId,
                        clientEmail,
                        privateKey,
                    }),
                }, 'chamba');
        this.messaging = (0, messaging_1.getMessaging)(this.app);
    }
    isEnabled() {
        return this.messaging !== null;
    }
    async sendToToken(params) {
        if (!this.messaging) {
            return null;
        }
        return this.messaging.send({
            token: params.token,
            notification: {
                title: params.title,
                body: params.body,
            },
            data: params.data,
        });
    }
    async sendToTokens(params) {
        if (!this.messaging || params.tokens.length === 0) {
            return 0;
        }
        const response = await this.messaging.sendEachForMulticast({
            tokens: params.tokens,
            notification: {
                title: params.title,
                body: params.body,
            },
            data: params.data,
        });
        return response.successCount;
    }
    normalizePrivateKey(privateKey) {
        if (!privateKey) {
            return null;
        }
        return privateKey.replace(/\\n/g, '\n');
    }
};
exports.PushService = PushService;
exports.PushService = PushService = PushService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], PushService);
//# sourceMappingURL=push.service.js.map