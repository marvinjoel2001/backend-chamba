import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { SendTestPushDto } from './dto/send-test-push.dto';
import { NotificationsService } from './notifications.service';

class NotificationsStatusResponseDto {
  @ApiProperty({ example: 'firebase-fcm' })
  provider: string;

  @ApiProperty({ example: false })
  enabled: boolean;

  @ApiProperty({
    example: 'FCM wiring listo. Completa FIREBASE_* para envios reales.',
  })
  note: string;
}

class SendTestPushResponseDto {
  @ApiProperty({ example: false })
  enabled: boolean;

  @ApiProperty({ example: null, nullable: true })
  messageId: string | null;
}

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @ApiOperation({ summary: 'Verificar estado de integración FCM' })
  @ApiOkResponse({ type: NotificationsStatusResponseDto })
  @Get('status')
  status() {
    return {
      provider: 'firebase-fcm',
      enabled: this.notificationsService.isPushEnabled(),
      note: 'FCM wiring listo. Completa FIREBASE_* para envios reales.',
    };
  }

  @ApiOperation({ summary: 'Enviar push de prueba por token FCM' })
  @ApiBody({ type: SendTestPushDto })
  @ApiOkResponse({ type: SendTestPushResponseDto })
  @Post('test-push')
  sendTestPush(@Body() payload: SendTestPushDto) {
    return this.notificationsService.sendTestPush(payload);
  }
}
