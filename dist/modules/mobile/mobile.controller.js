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
const notifications_service_1 = require("../notifications/notifications.service");
const parseNumber = (value) => {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
};
let MobileController = class MobileController {
    mobileService;
    notificationsService;
    constructor(mobileService, notificationsService) {
        this.mobileService = mobileService;
        this.notificationsService = notificationsService;
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
    googleLogin(idToken) {
        return this.mobileService.googleLogin(idToken);
    }
    googleRegister(email, firstName, lastName, googleId, type) {
        return this.mobileService.googleRegister({
            email,
            firstName,
            lastName,
            googleId,
            type,
        });
    }
    checkIdentifier(identifier) {
        return this.mobileService.checkIdentifier(identifier);
    }
    getExploreData(userId, lat, lng, radiusKm) {
        return this.mobileService.getExploreData({
            userId,
            latitude: parseNumber(lat),
            longitude: parseNumber(lng),
            radiusKm: parseNumber(radiusKm),
        });
    }
    previewRequestCategories(title, description, category) {
        return this.mobileService.previewRequestCategories({
            title,
            description,
            category,
        });
    }
    createRequest(clientUserId, title, description, category, aiCategories, budget, priceType, address, latitude, longitude, scheduledAt, photosBase64, photos, paymentMethod) {
        return this.mobileService.createRequest({
            clientUserId,
            title,
            description,
            category,
            aiCategories: aiCategories?.map((item) => ({
                id: item.id,
                name: item.name ?? item.nombre ?? '',
                confidence: Number(item.confidence ?? item.confianza ?? 0),
            })),
            budget: Number(budget),
            priceType,
            address,
            latitude: Number(latitude),
            longitude: Number(longitude),
            scheduledAt,
            photosBase64,
            paymentMethod,
            photos: photos?.map((item) => ({
                url: item.url ?? '',
                publicId: item.publicId ?? '',
            })) ?? [],
        });
    }
    getCategories() {
        return this.mobileService.listCategories();
    }
    createCategory(id, name, description, icon, parentId, active) {
        return this.mobileService.createCategory({
            id,
            name,
            description,
            icon,
            parentId,
            active,
        });
    }
    uploadProfilePhoto(userId, imageBase64, imageUrl, imagePublicId) {
        return this.mobileService.uploadProfilePhoto({
            userId,
            imageBase64,
            imageUrl,
            imagePublicId,
        });
    }
    removeProfilePhoto(userId) {
        return this.mobileService.removeProfilePhoto(userId);
    }
    submitWorkerVerification(workerUserId, idPhotoBase64, facePhotoBase64) {
        return this.mobileService.submitWorkerVerification({
            workerUserId,
            idPhotoBase64,
            facePhotoBase64,
        });
    }
    deleteRequestPhoto(requestPhotoId, clientUserId) {
        return this.mobileService.deleteRequestPhoto({
            requestPhotoId,
            clientUserId,
        });
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
    getThreadMessages(threadId, limit, before) {
        return this.mobileService.getThreadMessages(threadId, {
            limit: parseNumber(limit),
            before,
        });
    }
    sendThreadMessage(threadId, senderUserId, content) {
        return this.mobileService.sendMessage({ threadId, senderUserId, content });
    }
    archiveThread(threadId, userId) {
        return this.mobileService.archiveThread({ threadId, userId });
    }
    broadcastNotification(payload) {
        return this.mobileService.broadcastNotification(payload);
    }
    getPushUsers() {
        return this.mobileService.getPushUsers();
    }
    getIncomingRequest(workerUserId) {
        return this.mobileService.getIncomingRequest(workerUserId);
    }
    blockUser(userId, blockedUserId) {
        return this.mobileService.blockUser(userId, blockedUserId);
    }
    reportRequest(requestId, reporterUserId, reason) {
        return this.mobileService.reportRequest(requestId, reporterUserId, reason);
    }
    dismissRequest(requestId, workerUserId) {
        return this.mobileService.dismissRequest(requestId, workerUserId);
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
    discardOffer(requestId, workerUserId) {
        return this.mobileService.discardOffer({ requestId, workerUserId });
    }
    declineOffer(requestId, workerUserId) {
        return this.mobileService.declineOffer({ requestId, workerUserId });
    }
    reactivateOffer(requestId, workerUserId) {
        return this.mobileService.reactivateOffer({ requestId, workerUserId });
    }
    clientCounterOffer(requestId, clientUserId, amount) {
        return this.mobileService.clientCounterOffer({
            requestId,
            clientUserId,
            amount: Number(amount),
        });
    }
    getTracking(requestId) {
        return this.mobileService.getTracking(requestId);
    }
    workerMarkArrived(requestId, workerUserId) {
        return this.mobileService.workerMarkArrived({ requestId, workerUserId });
    }
    clientConfirmArrival(requestId, clientUserId) {
        return this.mobileService.clientConfirmArrival({ requestId, clientUserId });
    }
    completeJob(requestId, workerUserId) {
        return this.mobileService.completeJob({ requestId, workerUserId });
    }
    cancelJob(requestId, userId) {
        return this.mobileService.cancelJob({ requestId, userId });
    }
    getWorkerRadar(workerUserId) {
        return this.mobileService.getWorkerRadar(workerUserId);
    }
    getAdminMapSnapshot(since) {
        return this.mobileService.getAdminMapSnapshot({ since });
    }
    getAdminWallet(period) {
        return this.mobileService.getAdminWallet({
            period: period === 'day' || period === 'week' || period === 'month' ? period : undefined,
        });
    }
    getAdminWorkerNotificationSettings() {
        return this.mobileService.getAdminWorkerNotificationSettings();
    }
    updateAdminWorkerNotificationSettings(radiusKm) {
        return this.mobileService.updateAdminWorkerNotificationSettings({
            radiusKm: Number(radiusKm),
        });
    }
    getRequestNotifiedWorkers(requestId) {
        return this.mobileService.getRequestNotifiedWorkers(requestId);
    }
    setWorkerAvailability(workerUserId, available) {
        return this.mobileService.setWorkerAvailability(workerUserId, available);
    }
    updateWorkerLocation(workerUserId, latitude, longitude) {
        return this.mobileService.updateWorkerLocation({
            workerUserId,
            latitude: Number(latitude),
            longitude: Number(longitude),
        });
    }
    getWorkerSkills(workerUserId) {
        return this.mobileService.getWorkerSkills(workerUserId);
    }
    getWorkerHistory(workerUserId) {
        return this.mobileService.getWorkerHistory(workerUserId);
    }
    getClientHistory(clientUserId) {
        return this.mobileService.getClientHistory(clientUserId);
    }
    async getNotifications(userId, page, limit) {
        if (!userId) {
            return { items: [], hasMore: false };
        }
        const pageNum = Math.max(1, parseInt(page || '1', 10));
        const limitNum = Math.min(50, Math.max(1, parseInt(limit || '20', 10)));
        return this.notificationsService.getUserNotifications(userId, pageNum, limitNum);
    }
    async getUnreadCount(userId) {
        if (!userId) {
            return { count: 0 };
        }
        const count = await this.notificationsService.getUnreadCount(userId);
        return { count };
    }
    async markNotificationsRead(userId) {
        if (!userId) {
            return { success: false };
        }
        await this.notificationsService.markNotificationsAsRead(userId);
        return { success: true };
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
    getUserDisputes(userId) {
        return this.mobileService.getUserDisputes(userId);
    }
    listDisputes(status) {
        return this.mobileService.listDisputes({ status: status || undefined });
    }
    createDispute(requestId, reportedBy, reportedUser, reason, description) {
        return this.mobileService.createDispute({
            requestId,
            reportedBy,
            reportedUser,
            reason: reason ?? '',
            description,
        });
    }
    resolveDispute(disputeId, resolution, resolvedBy) {
        return this.mobileService.resolveDispute({
            disputeId,
            resolution,
            resolvedBy: resolvedBy ?? 'admin',
        });
    }
    getUserActiveDisputes(userId) {
        return this.mobileService.getUserActiveDisputes(userId);
    }
    getDisputeMessages(disputeId, readBy) {
        return this.mobileService.getDisputeMessages(disputeId, readBy);
    }
    sendDisputeMessage(disputeId, senderType, senderId, content) {
        return this.mobileService.sendDisputeMessage({
            disputeId,
            senderType: senderType || 'user',
            senderId,
            content: content ?? '',
        });
    }
    adminCancelJob(requestId) {
        return this.mobileService.adminCancelJob({ requestId });
    }
    getCancellationStats() {
        return this.mobileService.getCancellationStats();
    }
    getCommissionConfig() {
        return this.mobileService.getCommissionConfig();
    }
    updateCommissionConfig(commissionPercent) {
        return this.mobileService.updateCommissionConfig({
            commissionPercent: Number(commissionPercent),
        });
    }
    getAiConfig() {
        return this.mobileService.getAiConfig();
    }
    updateAiConfig(activeProvider, geminiKey, nvidiaKey, deepseekKey) {
        return this.mobileService.updateAiConfig({
            activeProvider,
            geminiKey,
            nvidiaKey,
            deepseekKey,
        });
    }
    listAllCategories() {
        return this.mobileService.listAllCategories();
    }
    updateCategory(categoryId, name, description, icon, active) {
        return this.mobileService.updateCategory({
            id: categoryId,
            name,
            description,
            icon,
            active,
        });
    }
    deleteCategory(categoryId) {
        return this.mobileService.deleteCategory(categoryId);
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
    (0, common_1.Post)('auth/google'),
    __param(0, (0, common_1.Body)('idToken')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "googleLogin", null);
__decorate([
    (0, common_1.Post)('auth/google/register'),
    __param(0, (0, common_1.Body)('email')),
    __param(1, (0, common_1.Body)('firstName')),
    __param(2, (0, common_1.Body)('lastName')),
    __param(3, (0, common_1.Body)('googleId')),
    __param(4, (0, common_1.Body)('type')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, String, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "googleRegister", null);
__decorate([
    (0, common_1.Post)('auth/check-identifier'),
    __param(0, (0, common_1.Body)('identifier')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "checkIdentifier", null);
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
    (0, common_1.Post)('mobile/request-categories/preview'),
    __param(0, (0, common_1.Body)('title')),
    __param(1, (0, common_1.Body)('description')),
    __param(2, (0, common_1.Body)('category')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "previewRequestCategories", null);
__decorate([
    (0, common_1.Post)('mobile/requests'),
    __param(0, (0, common_1.Body)('clientUserId')),
    __param(1, (0, common_1.Body)('title')),
    __param(2, (0, common_1.Body)('description')),
    __param(3, (0, common_1.Body)('category')),
    __param(4, (0, common_1.Body)('aiCategories')),
    __param(5, (0, common_1.Body)('budget')),
    __param(6, (0, common_1.Body)('priceType')),
    __param(7, (0, common_1.Body)('address')),
    __param(8, (0, common_1.Body)('latitude')),
    __param(9, (0, common_1.Body)('longitude')),
    __param(10, (0, common_1.Body)('scheduledAt')),
    __param(11, (0, common_1.Body)('photosBase64')),
    __param(12, (0, common_1.Body)('photos')),
    __param(13, (0, common_1.Body)('paymentMethod')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object, Object, Number, String, String, Number, Number, String, Array, Array, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "createRequest", null);
__decorate([
    (0, common_1.Get)('mobile/categories'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "getCategories", null);
__decorate([
    (0, common_1.Post)('mobile/categories'),
    __param(0, (0, common_1.Body)('id')),
    __param(1, (0, common_1.Body)('name')),
    __param(2, (0, common_1.Body)('description')),
    __param(3, (0, common_1.Body)('icon')),
    __param(4, (0, common_1.Body)('parentId')),
    __param(5, (0, common_1.Body)('active')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String, Boolean]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "createCategory", null);
__decorate([
    (0, common_1.Post)('mobile/profile/photo'),
    __param(0, (0, common_1.Body)('userId')),
    __param(1, (0, common_1.Body)('imageBase64')),
    __param(2, (0, common_1.Body)('imageUrl')),
    __param(3, (0, common_1.Body)('imagePublicId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
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
    (0, common_1.Post)('mobile/worker/verification'),
    __param(0, (0, common_1.Body)('workerUserId')),
    __param(1, (0, common_1.Body)('idPhotoBase64')),
    __param(2, (0, common_1.Body)('facePhotoBase64')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "submitWorkerVerification", null);
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
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('before')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
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
    (0, common_1.Post)('mobile/messages/:threadId/archive'),
    __param(0, (0, common_1.Param)('threadId')),
    __param(1, (0, common_1.Body)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "archiveThread", null);
__decorate([
    (0, common_1.Post)('mobile/admin/notifications/broadcast'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "broadcastNotification", null);
__decorate([
    (0, common_1.Get)('mobile/admin/push-users'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "getPushUsers", null);
__decorate([
    (0, common_1.Get)('mobile/incoming-request'),
    __param(0, (0, common_1.Query)('workerUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "getIncomingRequest", null);
__decorate([
    (0, common_1.Post)('mobile/users/:userId/block'),
    __param(0, (0, common_1.Param)('userId')),
    __param(1, (0, common_1.Body)('blockedUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "blockUser", null);
__decorate([
    (0, common_1.Post)('mobile/requests/:requestId/report'),
    __param(0, (0, common_1.Param)('requestId')),
    __param(1, (0, common_1.Body)('reporterUserId')),
    __param(2, (0, common_1.Body)('reason')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "reportRequest", null);
__decorate([
    (0, common_1.Post)('mobile/requests/:requestId/dismiss'),
    __param(0, (0, common_1.Param)('requestId')),
    __param(1, (0, common_1.Body)('workerUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "dismissRequest", null);
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
    (0, common_1.Post)('mobile/offers/discard'),
    __param(0, (0, common_1.Body)('requestId')),
    __param(1, (0, common_1.Body)('workerUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "discardOffer", null);
__decorate([
    (0, common_1.Post)('mobile/offers/decline'),
    __param(0, (0, common_1.Body)('requestId')),
    __param(1, (0, common_1.Body)('workerUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "declineOffer", null);
__decorate([
    (0, common_1.Post)('mobile/offers/reactivate'),
    __param(0, (0, common_1.Body)('requestId')),
    __param(1, (0, common_1.Body)('workerUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "reactivateOffer", null);
__decorate([
    (0, common_1.Post)('mobile/offers/client-counter'),
    __param(0, (0, common_1.Body)('requestId')),
    __param(1, (0, common_1.Body)('clientUserId')),
    __param(2, (0, common_1.Body)('amount')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "clientCounterOffer", null);
__decorate([
    (0, common_1.Get)('mobile/tracking'),
    __param(0, (0, common_1.Query)('requestId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "getTracking", null);
__decorate([
    (0, common_1.Post)('mobile/tracking/worker-arrived'),
    __param(0, (0, common_1.Body)('requestId')),
    __param(1, (0, common_1.Body)('workerUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "workerMarkArrived", null);
__decorate([
    (0, common_1.Post)('mobile/tracking/client-confirm'),
    __param(0, (0, common_1.Body)('requestId')),
    __param(1, (0, common_1.Body)('clientUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "clientConfirmArrival", null);
__decorate([
    (0, common_1.Post)('mobile/tracking/complete'),
    __param(0, (0, common_1.Body)('requestId')),
    __param(1, (0, common_1.Body)('workerUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "completeJob", null);
__decorate([
    (0, common_1.Post)('mobile/tracking/cancel'),
    __param(0, (0, common_1.Body)('requestId')),
    __param(1, (0, common_1.Body)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "cancelJob", null);
__decorate([
    (0, common_1.Get)('mobile/worker/radar'),
    __param(0, (0, common_1.Query)('workerUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "getWorkerRadar", null);
__decorate([
    (0, common_1.Get)('mobile/admin/map-snapshot'),
    __param(0, (0, common_1.Query)('since')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "getAdminMapSnapshot", null);
__decorate([
    (0, common_1.Get)('mobile/admin/wallet'),
    __param(0, (0, common_1.Query)('period')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "getAdminWallet", null);
__decorate([
    (0, common_1.Get)('mobile/admin/worker-notification-settings'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "getAdminWorkerNotificationSettings", null);
__decorate([
    (0, common_1.Post)('mobile/admin/worker-notification-settings'),
    __param(0, (0, common_1.Body)('radiusKm')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "updateAdminWorkerNotificationSettings", null);
__decorate([
    (0, common_1.Get)('mobile/admin/requests/:requestId/notified-workers'),
    __param(0, (0, common_1.Param)('requestId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "getRequestNotifiedWorkers", null);
__decorate([
    (0, common_1.Post)('mobile/worker/availability'),
    __param(0, (0, common_1.Body)('workerUserId')),
    __param(1, (0, common_1.Body)('available', common_1.ParseBoolPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Boolean]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "setWorkerAvailability", null);
__decorate([
    (0, common_1.Post)('mobile/worker/location'),
    __param(0, (0, common_1.Body)('workerUserId')),
    __param(1, (0, common_1.Body)('latitude')),
    __param(2, (0, common_1.Body)('longitude')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, Number]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "updateWorkerLocation", null);
__decorate([
    (0, common_1.Get)('mobile/worker/skills'),
    __param(0, (0, common_1.Query)('workerUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "getWorkerSkills", null);
__decorate([
    (0, common_1.Get)('mobile/worker/history'),
    __param(0, (0, common_1.Query)('workerUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "getWorkerHistory", null);
__decorate([
    (0, common_1.Get)('mobile/client/history'),
    __param(0, (0, common_1.Query)('clientUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "getClientHistory", null);
__decorate([
    (0, common_1.Get)('mobile/notifications'),
    __param(0, (0, common_1.Query)('userId')),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], MobileController.prototype, "getNotifications", null);
__decorate([
    (0, common_1.Get)('mobile/notifications/unread-count'),
    __param(0, (0, common_1.Query)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MobileController.prototype, "getUnreadCount", null);
__decorate([
    (0, common_1.Patch)('mobile/notifications/read'),
    __param(0, (0, common_1.Body)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MobileController.prototype, "markNotificationsRead", null);
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
__decorate([
    (0, common_1.Get)('mobile/admin/users/:userId/disputes'),
    __param(0, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "getUserDisputes", null);
__decorate([
    (0, common_1.Get)('mobile/admin/disputes'),
    __param(0, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "listDisputes", null);
__decorate([
    (0, common_1.Post)('mobile/disputes'),
    __param(0, (0, common_1.Body)('requestId')),
    __param(1, (0, common_1.Body)('reportedBy')),
    __param(2, (0, common_1.Body)('reportedUser')),
    __param(3, (0, common_1.Body)('reason')),
    __param(4, (0, common_1.Body)('description')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "createDispute", null);
__decorate([
    (0, common_1.Post)('mobile/admin/disputes/:disputeId/resolve'),
    __param(0, (0, common_1.Param)('disputeId')),
    __param(1, (0, common_1.Body)('resolution')),
    __param(2, (0, common_1.Body)('resolvedBy')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "resolveDispute", null);
__decorate([
    (0, common_1.Get)('mobile/disputes/user/:userId'),
    __param(0, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "getUserActiveDisputes", null);
__decorate([
    (0, common_1.Get)('mobile/disputes/:disputeId/messages'),
    __param(0, (0, common_1.Param)('disputeId')),
    __param(1, (0, common_1.Query)('readBy')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "getDisputeMessages", null);
__decorate([
    (0, common_1.Post)('mobile/disputes/:disputeId/messages'),
    __param(0, (0, common_1.Param)('disputeId')),
    __param(1, (0, common_1.Body)('senderType')),
    __param(2, (0, common_1.Body)('senderId')),
    __param(3, (0, common_1.Body)('content')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "sendDisputeMessage", null);
__decorate([
    (0, common_1.Post)('mobile/admin/requests/:requestId/cancel'),
    __param(0, (0, common_1.Param)('requestId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "adminCancelJob", null);
__decorate([
    (0, common_1.Get)('mobile/admin/cancellation-stats'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "getCancellationStats", null);
__decorate([
    (0, common_1.Get)('mobile/admin/commission'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "getCommissionConfig", null);
__decorate([
    (0, common_1.Post)('mobile/admin/commission'),
    __param(0, (0, common_1.Body)('commissionPercent')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "updateCommissionConfig", null);
__decorate([
    (0, common_1.Get)('mobile/admin/ai-config'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "getAiConfig", null);
__decorate([
    (0, common_1.Post)('mobile/admin/ai-config'),
    __param(0, (0, common_1.Body)('activeProvider')),
    __param(1, (0, common_1.Body)('geminiKey')),
    __param(2, (0, common_1.Body)('nvidiaKey')),
    __param(3, (0, common_1.Body)('deepseekKey')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "updateAiConfig", null);
__decorate([
    (0, common_1.Get)('mobile/admin/categories'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "listAllCategories", null);
__decorate([
    (0, common_1.Patch)('mobile/admin/categories/:categoryId'),
    __param(0, (0, common_1.Param)('categoryId')),
    __param(1, (0, common_1.Body)('name')),
    __param(2, (0, common_1.Body)('description')),
    __param(3, (0, common_1.Body)('icon')),
    __param(4, (0, common_1.Body)('active')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, Boolean]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "updateCategory", null);
__decorate([
    (0, common_1.Delete)('mobile/admin/categories/:categoryId'),
    __param(0, (0, common_1.Param)('categoryId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MobileController.prototype, "deleteCategory", null);
exports.MobileController = MobileController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [mobile_service_1.MobileService,
        notifications_service_1.NotificationsService])
], MobileController);
//# sourceMappingURL=mobile.controller.js.map