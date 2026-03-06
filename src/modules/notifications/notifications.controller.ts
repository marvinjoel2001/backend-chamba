import { Body, Controller, Get, Post } from '@nestjs/common';
import { SendTestPushDto } from './dto/send-test-push.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('status')
  status() {
    return {
      provider: 'firebase-fcm',
      enabled: this.notificationsService.isPushEnabled(),
      note: 'FCM wiring listo. Completa FIREBASE_* para envios reales.',
    };
  }

  @Post('test-push')
  sendTestPush(@Body() payload: SendTestPushDto) {
    return this.notificationsService.sendTestPush(payload);
  }
}
