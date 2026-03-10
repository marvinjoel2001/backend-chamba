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
exports.MobileController = void 0;
const common_1 = require("@nestjs/common");
const mobile_service_1 = require("./mobile.service");
const parseNumber = (value) => {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
};
let MobileController = class MobileController {
    mobileService;
    constructor(mobileService) {
        this.mobileService = mobileService;
    }
    register(type, email, phone, firstName, lastName, password) {
        return this.mobileService.register({
            type,
            email,
            phone,
            firstName,
            lastName,
            password,
        });
    }
    login(identifier, password) {
        return this.mobileService.login(identifier, password);
    }
    getExploreData(userId, lat, lng, radiusKm) {
        return this.mobileService.getExploreData({
            userId,
            latitude: parseNumber(lat),
            longitude: parseNumber(lng),
            radiusKm: parseNumber(radiusKm),
        });
    }
    createRequest(clientUserId, title, description, category, budget, priceType, address, latitude, longitude, scheduledAt, photosBase64) {
        return this.mobileService.createRequest({
            clientUserId,
            title,
            description,
            category,
            budget: Number(budget),
            priceType,
            address,
            latitude: Number(latitude),
            longitude: Number(longitude),
            scheduledAt,
            photosBase64,
        });
    }
    uploadProfilePhoto(userId, imageBase64) {
        return this.mobileService.uploadProfilePhoto({ userId, imageBase64 });
    }
    removeProfilePhoto(userId) {
        return this.mobileService.removeProfilePhoto(userId);
    }
    deleteRequestPhoto(requestPhotoId, clientUserId) {
        return this.mobileService.deleteRequestPhoto({ requestPhotoId, clientUserId });
    }
    upsertPushToken(userId, token, platform) {
        return this.mobileService.upsertPushToken({ userId, token, platform });
    }
    getRequestStatus(requestId, clientUserId) {
        return this.mobileService.getRequestStatus({ requestId, clientUserId });
    }
    getOffers(requestId, clientUserId) {
        return this.mobileService.getOffers({ requestId, clientUserId });
    }
    getWorkerProfile(workerId) {
        return this.mobileService.getWorkerProfile(workerId);
    }
    getMessages(userId) {
        return this.mobileService.getMessages(userId);
    }
    getThreadMessages(threadId) {
        return this.mobileService.getThreadMessages(threadId);
    }
    sendThreadMessage(threadId, senderUserId, content) {
        return this.mobileService.sendMessage({ threadId, senderUserId, content });
    }
    getIncomingRequest(workerUserId) {
        return this.mobileService.getIncomingRequest(workerUserId);
    }
    upsertOffer(requestId, workerUserId, amount, message) {
        return this.mobileService.upsertOffer({
            requestId,
            workerUserId,
            amount: Number(amount),
            message,
        });
    }
    acceptOffer(offerId, clientUserId) {
        return this.mobileService.acceptOffer({ offerId, clientUserId });
    }
    getTracking(requestId) {
        return this.mobileService.getTracking(requestId);
    }
    getWorkerRadar(workerUserId) {
        return this.mobileService.getWorkerRadar(workerUserId);
    }
    setWorkerAvailability(workerUserId, available) {
        return this.mobileService.setWorkerAvailability(workerUserId, available);
    }
    getWorkerSkills(workerUserId) {
        return this.mobileService.getWorkerSkills(workerUserId);
    }
    updateWorkerSkills(workerUserId, skills) {
        return this.mobileService.updateWorkerSkills(workerUserId, skills ?? []);
    }
    createReview(requestId, workerUserId, clientUserId, stars, comment) {
        return this.mobileService.createReview({
            requestId,
            workerUserId,
            clientUserId,
            stars: Number(stars),
            comment,
        });
    }
};
exports.MobileController = MobileController;
__decorate([
    (0, common_1.Post)('auth/register'),
    __param(0, (0, common_1.Body)('type')),
    __param(1, (0, common_1.Body)('email')),
    __param(2, (0, common_1.Body)('phone')),
    __param(3, (0, common_1.Body)('firstName')),
    __param(4, (0, common_1.Body)('lastName')),
    __param(5, (0, common_1.Body)('password')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, String, Object, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "register", null);
__decorate([
    (0, common_1.Post)('auth/login'),
    __param(0, (0, common_1.Body)('identifier')),
    __param(1, (0, common_1.Body)('password')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "login", null);
__decorate([
    (0, common_1.Get)('mobile/explore'),
    __param(0, (0, common_1.Query)('userId')),
    __param(1, (0, common_1.Query)('lat')),
    __param(2, (0, common_1.Query)('lng')),
    __param(3, (0, common_1.Query)('radiusKm')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "getExploreData", null);
__decorate([
    (0, common_1.Post)('mobile/requests'),
    __param(0, (0, common_1.Body)('clientUserId')),
    __param(1, (0, common_1.Body)('title')),
    __param(2, (0, common_1.Body)('description')),
    __param(3, (0, common_1.Body)('category')),
    __param(4, (0, common_1.Body)('budget')),
    __param(5, (0, common_1.Body)('priceType')),
    __param(6, (0, common_1.Body)('address')),
    __param(7, (0, common_1.Body)('latitude')),
    __param(8, (0, common_1.Body)('longitude')),
    __param(9, (0, common_1.Body)('scheduledAt')),
    __param(10, (0, common_1.Body)('photosBase64')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, Number, String, String, Number, Number, String, Array]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "createRequest", null);
__decorate([
    (0, common_1.Post)('mobile/profile/photo'),
    __param(0, (0, common_1.Body)('userId')),
    __param(1, (0, common_1.Body)('imageBase64')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "uploadProfilePhoto", null);
__decorate([
    (0, common_1.Post)('mobile/profile/photo/delete'),
    __param(0, (0, common_1.Body)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "removeProfilePhoto", null);
__decorate([
    (0, common_1.Post)('mobile/requests/photos/delete'),
    __param(0, (0, common_1.Body)('requestPhotoId')),
    __param(1, (0, common_1.Body)('clientUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "deleteRequestPhoto", null);
__decorate([
    (0, common_1.Post)('mobile/push/token'),
    __param(0, (0, common_1.Body)('userId')),
    __param(1, (0, common_1.Body)('token')),
    __param(2, (0, common_1.Body)('platform')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "upsertPushToken", null);
__decorate([
    (0, common_1.Get)('mobile/request-status'),
    __param(0, (0, common_1.Query)('requestId')),
    __param(1, (0, common_1.Query)('clientUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "getRequestStatus", null);
__decorate([
    (0, common_1.Get)('mobile/offers'),
    __param(0, (0, common_1.Query)('requestId')),
    __param(1, (0, common_1.Query)('clientUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "getOffers", null);
__decorate([
    (0, common_1.Get)('mobile/workers/:workerId/profile'),
    __param(0, (0, common_1.Param)('workerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "getWorkerProfile", null);
__decorate([
    (0, common_1.Get)('mobile/messages'),
    __param(0, (0, common_1.Query)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "getMessages", null);
__decorate([
    (0, common_1.Get)('mobile/messages/:threadId'),
    __param(0, (0, common_1.Param)('threadId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "getThreadMessages", null);
__decorate([
    (0, common_1.Post)('mobile/messages/:threadId'),
    __param(0, (0, common_1.Param)('threadId')),
    __param(1, (0, common_1.Body)('senderUserId')),
    __param(2, (0, common_1.Body)('content')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "sendThreadMessage", null);
__decorate([
    (0, common_1.Get)('mobile/incoming-request'),
    __param(0, (0, common_1.Query)('workerUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "getIncomingRequest", null);
__decorate([
    (0, common_1.Post)('mobile/offers/counter'),
    __param(0, (0, common_1.Body)('requestId')),
    __param(1, (0, common_1.Body)('workerUserId')),
    __param(2, (0, common_1.Body)('amount')),
    __param(3, (0, common_1.Body)('message')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "upsertOffer", null);
__decorate([
    (0, common_1.Post)('mobile/offers/accept'),
    __param(0, (0, common_1.Body)('offerId')),
    __param(1, (0, common_1.Body)('clientUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "acceptOffer", null);
__decorate([
    (0, common_1.Get)('mobile/tracking'),
    __param(0, (0, common_1.Query)('requestId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "getTracking", null);
__decorate([
    (0, common_1.Get)('mobile/worker/radar'),
    __param(0, (0, common_1.Query)('workerUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "getWorkerRadar", null);
__decorate([
    (0, common_1.Post)('mobile/worker/availability'),
    __param(0, (0, common_1.Body)('workerUserId')),
    __param(1, (0, common_1.Body)('available', common_1.ParseBoolPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Boolean]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "setWorkerAvailability", null);
__decorate([
    (0, common_1.Get)('mobile/worker/skills'),
    __param(0, (0, common_1.Query)('workerUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "getWorkerSkills", null);
__decorate([
    (0, common_1.Post)('mobile/worker/skills'),
    __param(0, (0, common_1.Body)('workerUserId')),
    __param(1, (0, common_1.Body)('skills')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Array]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "updateWorkerSkills", null);
__decorate([
    (0, common_1.Post)('mobile/reviews'),
    __param(0, (0, common_1.Body)('requestId')),
    __param(1, (0, common_1.Body)('workerUserId')),
    __param(2, (0, common_1.Body)('clientUserId')),
    __param(3, (0, common_1.Body)('stars')),
    __param(4, (0, common_1.Body)('comment')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Number, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "createReview", null);
exports.MobileController = MobileController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [mobile_service_1.MobileService])
], MobileController);
//# sourceMappingURL=mobile.controller.js.map