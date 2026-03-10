import { Body, Controller, Get, Param, ParseBoolPipe, Post, Query } from '@nestjs/common';
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
    @Body('budget') budget: number,
    @Body('priceType') priceType: string,
    @Body('address') address: string,
    @Body('latitude') latitude: number,
    @Body('longitude') longitude: number,
    @Body('scheduledAt') scheduledAt?: string,
  ) {
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
    });
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

  @Get('mobile/worker/skills')
  getWorkerSkills(@Query('workerUserId') workerUserId: string) {
    return this.mobileService.getWorkerSkills(workerUserId);
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
