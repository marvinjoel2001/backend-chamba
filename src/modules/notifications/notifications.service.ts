import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PushService } from '../../infrastructure/push/push.service';
import { SendTestPushDto } from './dto/send-test-push.dto';
import { Notification } from './entities/notification.entity';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly pushService: PushService,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
  ) {}

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

  async broadcastPush(params: {
    tokens: string[];
    title: string;
    body: string;
  }): Promise<number> {
    if (params.tokens.length === 0) return 0;
    return this.pushService.sendToTokens({
      tokens: params.tokens,
      title: params.title,
      body: params.body,
      data: { type: 'broadcast' },
    });
  }

  async notifyWorkersForJobWave(params: {
    users: { userId: string; token: string }[];
    jobId: string;
    category: string;
    offeredPrice: string;
    distanceKm: string;
  }): Promise<number> {
    const title = `📍 Trabajo nuevo cerca: ${params.category}`;
    const body = `Tienes una solicitud ${params.offeredPrice} a ${params.distanceKm} km. Toca para revisar.`;
    const type = 'request_new';

    // Guardar notificaciones
    const uniqueUserIds = [...new Set(params.users.map((u) => u.userId))];
    const notifications = uniqueUserIds.map((userId) =>
      this.notificationRepository.create({
        userId,
        title,
        body,
        type,
        data: { jobId: params.jobId },
      }),
    );
    if (notifications.length > 0) {
      await this.notificationRepository.save(notifications);
    }

    const tokens = params.users.map((u) => u.token).filter(Boolean);
    return this.pushService.sendToTokens({
      tokens,
      title,
      body,
      data: {
        type,
        jobId: params.jobId,
      },
    });
  }

  async notifyClientNewOffer(params: {
    userId: string;
    token: string;
    workerName: string;
    amount: number;
    jobTitle: string;
    requestId: string;
  }): Promise<string | null> {
    const title = `💰 ${params.workerName} ofertó Bs ${params.amount}`;
    const body = `En tu solicitud: ${params.jobTitle}`;
    const type = 'offer_new';

    await this.notificationRepository.save(
      this.notificationRepository.create({
        userId: params.userId,
        title,
        body,
        type,
        data: { requestId: params.requestId },
      }),
    );

    return this.pushService.sendToToken({
      token: params.token,
      title,
      body,
      data: {
        type,
        requestId: params.requestId,
      },
    });
  }

  async notifyWorkerOfferAccepted(params: {
    userId: string;
    token: string;
    clientName: string;
    jobTitle: string;
    requestId: string;
  }): Promise<string | null> {
    const title = `✅ ¡Oferta aceptada!`;
    const body = `${params.clientName} aceptó tu oferta en: ${params.jobTitle}`;
    const type = 'offer_accepted';

    await this.notificationRepository.save(
      this.notificationRepository.create({
        userId: params.userId,
        title,
        body,
        type,
        data: { requestId: params.requestId },
      }),
    );

    return this.pushService.sendToToken({
      token: params.token,
      title,
      body,
      data: {
        type,
        requestId: params.requestId,
      },
    });
  }

  async notifyNewMessage(params: {
    userId: string;
    token: string;
    senderName: string;
    message: string;
    threadId: string;
  }): Promise<string | null> {
    // Note: We don't save chat messages in the notifications table to avoid spam
    // The chat list handles its own unread counts.
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

  async notifyWorkerArrived(params: {
    userId: string;
    token: string;
    workerName: string;
    jobTitle: string;
    requestId: string;
  }): Promise<string | null> {
    const title = `📍 ${params.workerName} ha llegado`;
    const body = `El trabajador llegó a tu ubicación para: ${params.jobTitle}`;
    const type = 'worker_arrived';

    await this.notificationRepository.save(
      this.notificationRepository.create({
        userId: params.userId,
        title,
        body,
        type,
        data: { requestId: params.requestId },
      }),
    );

    return this.pushService.sendToToken({
      token: params.token,
      title,
      body,
      data: { type, requestId: params.requestId },
    });
  }

  async notifyJobFinished(params: {
    userId: string;
    token: string;
    workerName: string;
    jobTitle: string;
    requestId: string;
  }): Promise<string | null> {
    const title = `🏁 Trabajo finalizado`;
    const body = `${params.workerName} marcó como terminado: ${params.jobTitle}`;
    const type = 'job_finished';

    await this.notificationRepository.save(
      this.notificationRepository.create({
        userId: params.userId,
        title,
        body,
        type,
        data: { requestId: params.requestId },
      }),
    );

    return this.pushService.sendToToken({
      token: params.token,
      title,
      body,
      data: { type, requestId: params.requestId },
    });
  }

  async getUserNotifications(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ items: Notification[]; hasMore: boolean }> {
    const skip = (page - 1) * limit;

    const [items, total] = await this.notificationRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip,
    });

    return {
      items,
      hasMore: skip + items.length < total,
    };
  }

  async markNotificationsAsRead(userId: string): Promise<void> {
    await this.notificationRepository.update(
      { userId, isRead: false },
      { isRead: true },
    );
  }
}
