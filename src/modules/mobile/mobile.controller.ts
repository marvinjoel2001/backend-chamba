import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { MobileService } from './mobile.service';
import { NotificationsService } from '../notifications/notifications.service';

const parseNumber = (value?: string): number | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

@Controller()
export class MobileController {
  constructor(
    private readonly mobileService: MobileService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Post('auth/register')
  register(
    @Body('type') type: string,
    @Body('email') email: string,
    @Body('phone') phone: string | undefined,
    @Body('firstName') firstName: string,
    @Body('lastName') lastName: string | undefined,
    @Body('password') password: string,
  ) {
    return this.mobileService.register({
      type,
      email,
      phone,
      firstName,
      lastName,
      password,
    });
  }

  @Post('auth/login')
  login(
    @Body('identifier') identifier: string,
    @Body('password') password: string,
  ) {
    return this.mobileService.login(identifier, password);
  }

  @Post('auth/google')
  googleLogin(@Body('idToken') idToken: string) {
    return this.mobileService.googleLogin(idToken);
  }

  @Post('auth/google/register')
  googleRegister(
    @Body('email') email: string,
    @Body('firstName') firstName: string,
    @Body('lastName') lastName: string | undefined,
    @Body('googleId') googleId: string,
    @Body('type') type: 'worker' | 'client',
  ) {
    return this.mobileService.googleRegister({
      email,
      firstName,
      lastName,
      googleId,
      type,
    });
  }

  @Post('auth/check-identifier')
  checkIdentifier(@Body('identifier') identifier: string) {
    return this.mobileService.checkIdentifier(identifier);
  }

  @Get('mobile/explore')
  getExploreData(
    @Query('userId') userId: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radiusKm') radiusKm?: string,
  ) {
    return this.mobileService.getExploreData({
      userId,
      latitude: parseNumber(lat),
      longitude: parseNumber(lng),
      radiusKm: parseNumber(radiusKm),
    });
  }

  @Post('mobile/request-categories/preview')
  previewRequestCategories(
    @Body('title') title: string | undefined,
    @Body('description') description: string,
    @Body('category') category: string | undefined,
  ) {
    return this.mobileService.previewRequestCategories({
      title,
      description,
      category,
    });
  }

  @Post('mobile/requests')
  createRequest(
    @Body('clientUserId') clientUserId: string,
    @Body('title') title: string,
    @Body('description') description: string,
    @Body('category') category: string | undefined,
    @Body('aiCategories')
    aiCategories:
      | Array<{
          id: string;
          name?: string;
          nombre?: string;
          confidence?: number;
          confianza?: number;
        }>
      | undefined,
    @Body('budget') budget: number,
    @Body('priceType') priceType: string,
    @Body('address') address: string,
    @Body('latitude') latitude: number,
    @Body('longitude') longitude: number,
    @Body('scheduledAt') scheduledAt?: string,
    @Body('photosBase64') photosBase64?: string[],
    @Body('photos')
    photos?: Array<{
      url?: string;
      publicId?: string;
    }>,
    @Body('paymentMethod') paymentMethod?: string,
  ) {
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
      photos:
        photos?.map((item) => ({
          url: item.url ?? '',
          publicId: item.publicId ?? '',
        })) ?? [],
    });
  }

  @Get('mobile/categories')
  getCategories() {
    return this.mobileService.listCategories();
  }

  @Post('mobile/categories')
  createCategory(
    @Body('id') id: string | undefined,
    @Body('name') name: string,
    @Body('description') description?: string,
    @Body('icon') icon?: string,
    @Body('parentId') parentId?: string,
    @Body('active') active?: boolean,
  ) {
    return this.mobileService.createCategory({
      id,
      name,
      description,
      icon,
      parentId,
      active,
    });
  }

  @Post('mobile/profile/photo')
  uploadProfilePhoto(
    @Body('userId') userId: string,
    @Body('imageBase64') imageBase64?: string,
    @Body('imageUrl') imageUrl?: string,
    @Body('imagePublicId') imagePublicId?: string,
  ) {
    return this.mobileService.uploadProfilePhoto({
      userId,
      imageBase64,
      imageUrl,
      imagePublicId,
    });
  }

  @Post('mobile/profile/photo/delete')
  removeProfilePhoto(@Body('userId') userId: string) {
    return this.mobileService.removeProfilePhoto(userId);
  }

  @Post('mobile/worker/verification')
  submitWorkerVerification(
    @Body('workerUserId') workerUserId: string,
    @Body('idPhotoBase64') idPhotoBase64: string,
    @Body('facePhotoBase64') facePhotoBase64: string,
  ) {
    return this.mobileService.submitWorkerVerification({
      workerUserId,
      idPhotoBase64,
      facePhotoBase64,
    });
  }

  @Post('mobile/requests/photos/delete')
  deleteRequestPhoto(
    @Body('requestPhotoId') requestPhotoId: string,
    @Body('clientUserId') clientUserId: string,
  ) {
    return this.mobileService.deleteRequestPhoto({
      requestPhotoId,
      clientUserId,
    });
  }

  @Post('mobile/push/token')
  upsertPushToken(
    @Body('userId') userId: string,
    @Body('token') token: string,
    @Body('platform') platform?: string,
  ) {
    return this.mobileService.upsertPushToken({ userId, token, platform });
  }

  @Get('mobile/request-status')
  getRequestStatus(
    @Query('requestId') requestId?: string,
    @Query('clientUserId') clientUserId?: string,
  ) {
    return this.mobileService.getRequestStatus({ requestId, clientUserId });
  }

  @Get('mobile/offers')
  getOffers(
    @Query('requestId') requestId?: string,
    @Query('clientUserId') clientUserId?: string,
  ) {
    return this.mobileService.getOffers({ requestId, clientUserId });
  }

  @Get('mobile/workers/:workerId/profile')
  getWorkerProfile(@Param('workerId') workerId: string) {
    return this.mobileService.getWorkerProfile(workerId);
  }

  @Get('mobile/messages')
  getMessages(@Query('userId') userId: string) {
    return this.mobileService.getMessages(userId);
  }

  @Get('mobile/messages/:threadId')
  getThreadMessages(
    @Param('threadId') threadId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.mobileService.getThreadMessages(threadId, {
      limit: parseNumber(limit),
      before,
    });
  }

  @Post('mobile/messages/:threadId')
  sendThreadMessage(
    @Param('threadId') threadId: string,
    @Body('senderUserId') senderUserId: string,
    @Body('content') content: string,
  ) {
    return this.mobileService.sendMessage({ threadId, senderUserId, content });
  }

  @Post('mobile/messages/:threadId/archive')
  archiveThread(
    @Param('threadId') threadId: string,
    @Body('userId') userId: string,
  ) {
    return this.mobileService.archiveThread({ threadId, userId });
  }

  @Post('mobile/admin/notifications/broadcast')
  broadcastNotification(
    @Body() payload: {
      target: 'all' | 'workers' | 'clients' | 'custom';
      type: 'push' | 'toast';
      title: string;
      body: string;
      toastType?: 'info' | 'success' | 'error';
      userIds?: string[];
    },
  ) {
    return this.mobileService.broadcastNotification(payload);
  }

  @Get('mobile/admin/push-users')
  getPushUsers() {
    return this.mobileService.getPushUsers();
  }

  @Get('mobile/incoming-request')
  getIncomingRequest(@Query('workerUserId') workerUserId: string) {
    return this.mobileService.getIncomingRequest(workerUserId);
  }

  @Post('mobile/users/:userId/block')
  blockUser(
    @Param('userId') userId: string,
    @Body('blockedUserId') blockedUserId: string,
  ) {
    return this.mobileService.blockUser(userId, blockedUserId);
  }

  @Post('mobile/requests/:requestId/report')
  reportRequest(
    @Param('requestId') requestId: string,
    @Body('reporterUserId') reporterUserId: string,
    @Body('reason') reason: string,
  ) {
    return this.mobileService.reportRequest(requestId, reporterUserId, reason);
  }

  @Post('mobile/requests/:requestId/dismiss')
  dismissRequest(
    @Param('requestId') requestId: string,
    @Body('workerUserId') workerUserId: string,
  ) {
    return this.mobileService.dismissRequest(requestId, workerUserId);
  }

  @Post('mobile/offers/counter')
  upsertOffer(
    @Body('requestId') requestId: string,
    @Body('workerUserId') workerUserId: string,
    @Body('amount') amount: number,
    @Body('message') message?: string,
  ) {
    return this.mobileService.upsertOffer({
      requestId,
      workerUserId,
      amount: Number(amount),
      message,
    });
  }

  @Post('mobile/offers/accept')
  acceptOffer(
    @Body('offerId') offerId: string,
    @Body('clientUserId') clientUserId: string,
  ) {
    return this.mobileService.acceptOffer({ offerId, clientUserId });
  }

  @Post('mobile/offers/discard')
  discardOffer(
    @Body('requestId') requestId: string,
    @Body('workerUserId') workerUserId: string,
  ) {
    return this.mobileService.discardOffer({ requestId, workerUserId });
  }

  @Post('mobile/offers/decline')
  declineOffer(
    @Body('requestId') requestId: string,
    @Body('workerUserId') workerUserId: string,
  ) {
    return this.mobileService.declineOffer({ requestId, workerUserId });
  }

  @Post('mobile/offers/reactivate')
  reactivateOffer(
    @Body('requestId') requestId: string,
    @Body('workerUserId') workerUserId: string,
  ) {
    return this.mobileService.reactivateOffer({ requestId, workerUserId });
  }

  @Post('mobile/offers/client-counter')
  clientCounterOffer(
    @Body('requestId') requestId: string,
    @Body('clientUserId') clientUserId: string,
    @Body('amount') amount: number,
  ) {
    return this.mobileService.clientCounterOffer({
      requestId,
      clientUserId,
      amount: Number(amount),
    });
  }

  @Get('mobile/tracking')
  getTracking(@Query('requestId') requestId: string) {
    return this.mobileService.getTracking(requestId);
  }

  @Post('mobile/tracking/worker-arrived')
  workerMarkArrived(
    @Body('requestId') requestId: string,
    @Body('workerUserId') workerUserId: string,
  ) {
    return this.mobileService.workerMarkArrived({ requestId, workerUserId });
  }

  @Post('mobile/tracking/client-confirm')
  clientConfirmArrival(
    @Body('requestId') requestId: string,
    @Body('clientUserId') clientUserId: string,
  ) {
    return this.mobileService.clientConfirmArrival({ requestId, clientUserId });
  }

  @Post('mobile/tracking/complete')
  completeJob(
    @Body('requestId') requestId: string,
    @Body('workerUserId') workerUserId: string,
  ) {
    return this.mobileService.completeJob({ requestId, workerUserId });
  }

  @Post('mobile/tracking/cancel')
  cancelJob(
    @Body('requestId') requestId: string,
    @Body('userId') userId: string,
  ) {
    return this.mobileService.cancelJob({ requestId, userId });
  }

  @Get('mobile/worker/radar')
  getWorkerRadar(@Query('workerUserId') workerUserId: string) {
    return this.mobileService.getWorkerRadar(workerUserId);
  }

  @Get('mobile/admin/map-snapshot')
  getAdminMapSnapshot(@Query('since') since?: string) {
    return this.mobileService.getAdminMapSnapshot({ since });
  }

  @Get('mobile/admin/wallet')
  getAdminWallet(@Query('period') period?: string) {
    return this.mobileService.getAdminWallet({
      period: period === 'day' || period === 'week' || period === 'month' ? period : undefined,
    });
  }

  @Get('mobile/admin/worker-notification-settings')
  getAdminWorkerNotificationSettings() {
    return this.mobileService.getAdminWorkerNotificationSettings();
  }

  @Post('mobile/admin/worker-notification-settings')
  updateAdminWorkerNotificationSettings(@Body('radiusKm') radiusKm: number) {
    return this.mobileService.updateAdminWorkerNotificationSettings({
      radiusKm: Number(radiusKm),
    });
  }

  @Get('mobile/admin/requests/:requestId/notified-workers')
  getRequestNotifiedWorkers(@Param('requestId') requestId: string) {
    return this.mobileService.getRequestNotifiedWorkers(requestId);
  }

  @Post('mobile/worker/availability')
  setWorkerAvailability(
    @Body('workerUserId') workerUserId: string,
    @Body('available', ParseBoolPipe) available: boolean,
  ) {
    return this.mobileService.setWorkerAvailability(workerUserId, available);
  }

  @Post('mobile/worker/location')
  updateWorkerLocation(
    @Body('workerUserId') workerUserId: string,
    @Body('latitude') latitude: number,
    @Body('longitude') longitude: number,
  ) {
    return this.mobileService.updateWorkerLocation({
      workerUserId,
      latitude: Number(latitude),
      longitude: Number(longitude),
    });
  }

  @Get('mobile/worker/skills')
  getWorkerSkills(@Query('workerUserId') workerUserId: string) {
    return this.mobileService.getWorkerSkills(workerUserId);
  }

  @Get('mobile/worker/history')
  getWorkerHistory(@Query('workerUserId') workerUserId: string) {
    return this.mobileService.getWorkerHistory(workerUserId);
  }

  @Get('mobile/client/history')
  getClientHistory(@Query('clientUserId') clientUserId: string) {
    return this.mobileService.getClientHistory(clientUserId);
  }

  // --- Notificaciones ---
  @Get('mobile/notifications')
  async getNotifications(
    @Query('userId') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (!userId) {
      return { items: [], hasMore: false };
    }
    const pageNum = Math.max(1, parseInt(page || '1', 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit || '20', 10)));
    return this.notificationsService.getUserNotifications(userId, pageNum, limitNum);
  }

  @Get('mobile/notifications/unread-count')
  async getUnreadCount(@Query('userId') userId: string) {
    if (!userId) {
      return { count: 0 };
    }
    const count = await this.notificationsService.getUnreadCount(userId);
    return { count };
  }

  @Patch('mobile/notifications/read')
  async markNotificationsRead(@Body('userId') userId: string) {
    if (!userId) {
      return { success: false };
    }
    await this.notificationsService.markNotificationsAsRead(userId);
    return { success: true };
  }

  @Post('mobile/worker/skills')
  updateWorkerSkills(
    @Body('workerUserId') workerUserId: string,
    @Body('skills') skills: string[],
  ) {
    return this.mobileService.updateWorkerSkills(workerUserId, skills ?? []);
  }

  @Post('mobile/reviews')
  createReview(
    @Body('requestId') requestId: string,
    @Body('workerUserId') workerUserId: string,
    @Body('clientUserId') clientUserId: string,
    @Body('stars') stars: number,
    @Body('comment') comment?: string,
  ) {
    return this.mobileService.createReview({
      requestId,
      workerUserId,
      clientUserId,
      stars: Number(stars),
      comment,
    });
  }
  // --- Disputes ---

  @Get('mobile/admin/users/:userId/disputes')
  getUserDisputes(@Param('userId') userId: string) {
    return this.mobileService.getUserDisputes(userId);
  }

  @Get('mobile/admin/disputes')
  listDisputes(@Query('status') status?: string) {
    return this.mobileService.listDisputes({ status: status || undefined });
  }

  @Post('mobile/disputes')
  createDispute(
    @Body('requestId') requestId: string | undefined,
    @Body('reportedBy') reportedBy: string,
    @Body('reportedUser') reportedUser?: string,
    @Body('reason') reason?: string,
    @Body('description') description?: string,
  ) {
    return this.mobileService.createDispute({
      requestId,
      reportedBy,
      reportedUser,
      reason: reason ?? '',
      description,
    });
  }

  @Post('mobile/admin/disputes/:disputeId/resolve')
  resolveDispute(
    @Param('disputeId') disputeId: string,
    @Body('resolution') resolution: string,
    @Body('resolvedBy') resolvedBy?: string,
  ) {
    return this.mobileService.resolveDispute({
      disputeId,
      resolution,
      resolvedBy: resolvedBy ?? 'admin',
    });
  }

  @Get('mobile/disputes/user/:userId')
  getUserActiveDisputes(@Param('userId') userId: string) {
    return this.mobileService.getUserActiveDisputes(userId);
  }

  @Get('mobile/disputes/:disputeId/messages')
  getDisputeMessages(
    @Param('disputeId') disputeId: string,
    @Query('readBy') readBy?: string,
  ) {
    return this.mobileService.getDisputeMessages(disputeId, readBy);
  }

  @Post('mobile/disputes/:disputeId/messages')
  sendDisputeMessage(
    @Param('disputeId') disputeId: string,
    @Body('senderType') senderType: string,
    @Body('senderId') senderId?: string,
    @Body('content') content?: string,
  ) {
    return this.mobileService.sendDisputeMessage({
      disputeId,
      senderType: senderType || 'user',
      senderId,
      content: content ?? '',
    });
  }

  // --- Admin: Cancel Job ---

  @Post('mobile/admin/requests/:requestId/cancel')
  adminCancelJob(@Param('requestId') requestId: string) {
    return this.mobileService.adminCancelJob({ requestId });
  }

  @Get('mobile/admin/cancellation-stats')
  getCancellationStats() {
    return this.mobileService.getCancellationStats();
  }

  // --- Admin: Commission Config ---

  @Get('mobile/admin/commission')
  getCommissionConfig() {
    return this.mobileService.getCommissionConfig();
  }

  @Post('mobile/admin/commission')
  updateCommissionConfig(@Body('commissionPercent') commissionPercent: number) {
    return this.mobileService.updateCommissionConfig({
      commissionPercent: Number(commissionPercent),
    });
  }

  // --- Admin: AI Config ---

  @Get('mobile/admin/ai-config')
  getAiConfig() {
    return this.mobileService.getAiConfig();
  }

  @Post('mobile/admin/ai-config')
  updateAiConfig(
    @Body('activeProvider') activeProvider: string,
    @Body('geminiKey') geminiKey: string,
    @Body('nvidiaKey') nvidiaKey: string,
    @Body('deepseekKey') deepseekKey: string,
  ) {
    return this.mobileService.updateAiConfig({
      activeProvider,
      geminiKey,
      nvidiaKey,
      deepseekKey,
    });
  }

  // --- Admin: Categories CRUD ---

  @Get('mobile/admin/categories')
  listAllCategories() {
    return this.mobileService.listAllCategories();
  }

  @Patch('mobile/admin/categories/:categoryId')
  updateCategory(
    @Param('categoryId') categoryId: string,
    @Body('name') name?: string,
    @Body('description') description?: string,
    @Body('icon') icon?: string,
    @Body('active') active?: boolean,
  ) {
    return this.mobileService.updateCategory({
      id: categoryId,
      name,
      description,
      icon,
      active,
    });
  }

  @Delete('mobile/admin/categories/:categoryId')
  deleteCategory(@Param('categoryId') categoryId: string) {
    return this.mobileService.deleteCategory(categoryId);
  }
}
