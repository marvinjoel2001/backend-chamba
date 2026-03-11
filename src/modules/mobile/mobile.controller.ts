import {
  Body,
  Controller,
  Get,
  Param,
  ParseBoolPipe,
  Post,
  Query,
} from '@nestjs/common';
import { MobileService } from './mobile.service';

const parseNumber = (value?: string): number | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

@Controller()
export class MobileController {
  constructor(private readonly mobileService: MobileService) {}

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

  @Post('mobile/requests')
  createRequest(
    @Body('clientUserId') clientUserId: string,
    @Body('title') title: string,
    @Body('description') description: string,
    @Body('category') category: string,
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
    @Body('imageBase64') imageBase64: string,
  ) {
    return this.mobileService.uploadProfilePhoto({ userId, imageBase64 });
  }

  @Post('mobile/profile/photo/delete')
  removeProfilePhoto(@Body('userId') userId: string) {
    return this.mobileService.removeProfilePhoto(userId);
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
  getThreadMessages(@Param('threadId') threadId: string) {
    return this.mobileService.getThreadMessages(threadId);
  }

  @Post('mobile/messages/:threadId')
  sendThreadMessage(
    @Param('threadId') threadId: string,
    @Body('senderUserId') senderUserId: string,
    @Body('content') content: string,
  ) {
    return this.mobileService.sendMessage({ threadId, senderUserId, content });
  }

  @Get('mobile/incoming-request')
  getIncomingRequest(@Query('workerUserId') workerUserId: string) {
    return this.mobileService.getIncomingRequest(workerUserId);
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

  @Get('mobile/tracking')
  getTracking(@Query('requestId') requestId: string) {
    return this.mobileService.getTracking(requestId);
  }

  @Get('mobile/worker/radar')
  getWorkerRadar(@Query('workerUserId') workerUserId: string) {
    return this.mobileService.getWorkerRadar(workerUserId);
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
}
