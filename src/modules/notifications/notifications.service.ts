import { Injectable } from '@nestjs/common';
import { PushService } from '../../infrastructure/push/push.service';
import { SendTestPushDto } from './dto/send-test-push.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly pushService: PushService) {}

  isPushEnabled(): boolean {
    return this.pushService.isEnabled();
  }

  async sendTestPush(payload: SendTestPushDto): Promise<{
    enabled: boolean;
    messageId: string | null;
  }> {
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

  async notifyWorkersForJobWave(params: {
    tokens: string[];
    jobId: string;
    category: string;
    offeredPrice: string;
    distanceKm: string;
  }): Promise<number> {
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

  async notifyClientNewOffer(params: {
    token: string;
    workerName: string;
    amount: number;
    jobTitle: string;
    requestId: string;
  }): Promise<string | null> {
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

  async notifyWorkerOfferAccepted(params: {
    token: string;
    clientName: string;
    jobTitle: string;
    requestId: string;
  }): Promise<string | null> {
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

  async notifyNewMessage(params: {
    token: string;
    senderName: string;
    message: string;
    threadId: string;
  }): Promise<string | null> {
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
}
