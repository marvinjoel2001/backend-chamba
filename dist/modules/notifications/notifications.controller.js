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
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const send_test_push_dto_1 = require("./dto/send-test-push.dto");
const notifications_service_1 = require("./notifications.service");
class NotificationsStatusResponseDto {
    provider;
    enabled;
    note;
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'firebase-fcm' }),
    __metadata("design:type", String)
], NotificationsStatusResponseDto.prototype, "provider", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: false }),
    __metadata("design:type", Boolean)
], NotificationsStatusResponseDto.prototype, "enabled", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'FCM wiring listo. Completa FIREBASE_* para envios reales.',
    }),
    __metadata("design:type", String)
], NotificationsStatusResponseDto.prototype, "note", void 0);
class SendTestPushResponseDto {
    enabled;
    messageId;
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: false }),
    __metadata("design:type", Boolean)
], SendTestPushResponseDto.prototype, "enabled", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: null, nullable: true }),
    __metadata("design:type", Object)
], SendTestPushResponseDto.prototype, "messageId", void 0);
let NotificationsController = class NotificationsController {
    notificationsService;
    constructor(notificationsService) {
        this.notificationsService = notificationsService;
    }
    status() {
        return {
            provider: 'firebase-fcm',
            enabled: this.notificationsService.isPushEnabled(),
            note: 'FCM wiring listo. Completa FIREBASE_* para envios reales.',
        };
    }
    sendTestPush(payload) {
        return this.notificationsService.sendTestPush(payload);
    }
};
exports.NotificationsController = NotificationsController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Verificar estado de integración FCM' }),
    (0, swagger_1.ApiOkResponse)({ type: NotificationsStatusResponseDto }),
    (0, common_1.Get)('status'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "status", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Enviar push de prueba por token FCM' }),
    (0, swagger_1.ApiBody)({ type: send_test_push_dto_1.SendTestPushDto }),
    (0, swagger_1.ApiOkResponse)({ type: SendTestPushResponseDto }),
    (0, common_1.Post)('test-push'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [send_test_push_dto_1.SendTestPushDto]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "sendTestPush", null);
exports.NotificationsController = NotificationsController = __decorate([
    (0, swagger_1.ApiTags)('Notifications'),
    (0, common_1.Controller)('notifications'),
    __metadata("design:paramtypes", [notifications_service_1.NotificationsService])
], NotificationsController);
//# sourceMappingURL=notifications.controller.js.map