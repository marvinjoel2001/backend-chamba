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

  getProjectId(): string | null {
    return this.pushService.getProjectId();
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
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
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
      data: { type: 'broadcast', click_action: 'FLUTTER_NOTIFICATION_CLICK' },
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
        data: { jobId: params.jobId, deep_link: `/request/${params.jobId}` },
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
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        deep_link: `/request/${params.jobId}`,
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
        data: {
          requestId: params.requestId,
          deep_link: `/request/${params.requestId}`,
        },
      }),
    );

    return this.pushService.sendToToken({
      token: params.token,
      title,
      body,
      data: {
        type,
        requestId: params.requestId,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        deep_link: `/request/${params.requestId}`,
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
        data: {
          requestId: params.requestId,
          deep_link: `/request/${params.requestId}`,
        },
      }),
    );

    return this.pushService.sendToToken({
      token: params.token,
      title,
      body,
      data: {
        type,
        requestId: params.requestId,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        deep_link: `/request/${params.requestId}`,
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
      body:
        params.message.length > 60
          ? params.message.substring(0, 60) + '...'
          : params.message,
      data: {
        type: 'message_new',
        threadId: params.threadId,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        deep_link: `/chat/${params.threadId}`,
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
        data: {
          requestId: params.requestId,
          deep_link: `/request/${params.requestId}`,
        },
      }),
    );

    return this.pushService.sendToToken({
      token: params.token,
      title,
      body,
      data: {
        type,
        requestId: params.requestId,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        deep_link: `/request/${params.requestId}`,
      },
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
        data: {
          requestId: params.requestId,
          deep_link: `/request/${params.requestId}`,
        },
      }),
    );

    return this.pushService.sendToToken({
      token: params.token,
      title,
      body,
      data: {
        type,
        requestId: params.requestId,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        deep_link: `/request/${params.requestId}`,
      },
    });
  }

  async notifyJobCancelled(params: {
    userId: string;
    token: string | null;
    cancelerName: string;
    jobTitle: string;
    requestId: string;
  }): Promise<string | null> {
    const title = `❌ Trabajo Cancelado`;
    const body = `${params.cancelerName} canceló el trabajo: ${params.jobTitle}`;
    const type = 'job_cancelled';

    await this.notificationRepository.save(
      this.notificationRepository.create({
        userId: params.userId,
        title,
        body,
        type,
        data: {
          requestId: params.requestId,
          deep_link: `/request/${params.requestId}`,
        },
      }),
    );

    if (!params.token) return null;
    return this.pushService.sendToToken({
      token: params.token,
      title,
      body,
      data: {
        type,
        requestId: params.requestId,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        deep_link: `/request/${params.requestId}`,
      },
    });
  }

  async notifySupportMessage(params: {
    userId: string;
    token: string | null;
    message: string;
  }): Promise<string | null> {
    const title = `🎧 Soporte Chamba`;
    const body =
      params.message.length > 60
        ? params.message.substring(0, 60) + '...'
        : params.message;
    const type = 'support_message';

    await this.notificationRepository.save(
      this.notificationRepository.create({
        userId: params.userId,
        title,
        body,
        type,
        data: { deep_link: `/support` },
      }),
    );

    if (!params.token) return null;
    return this.pushService.sendToToken({
      token: params.token,
      title,
      body,
      data: {
        type,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        deep_link: `/support`,
      },
    });
  }

  async notifyVerificationUpdated(params: {
    userId: string;
    token: string | null;
    status: 'verified' | 'rejected';
    message: string;
  }): Promise<string | null> {
    const title =
      params.status === 'verified'
        ? `✅ Cuenta Verificada`
        : `⚠️ Problema con tu verificación`;
    const body = params.message;
    const type = 'verification_update';

    await this.notificationRepository.save(
      this.notificationRepository.create({
        userId: params.userId,
        title,
        body,
        type,
        data: { deep_link: `/profile` },
      }),
    );

    if (!params.token) return null;
    return this.pushService.sendToToken({
      token: params.token,
      title,
      body,
      data: {
        type,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        deep_link: `/profile`,
      },
    });
  }

  async notifyWorkerCounterOffer(params: {
    userId: string;
    token: string | null;
    clientName: string;
    newAmount: number;
    jobTitle: string;
    requestId: string;
  }): Promise<string | null> {
    const title = `💰 ${params.clientName} subió su precio`;
    const body = `Nuevo precio: Bs ${Math.round(params.newAmount)} para: ${params.jobTitle}`;
    const type = 'counter_offer';

    await this.notificationRepository.save(
      this.notificationRepository.create({
        userId: params.userId,
        title,
        body,
        type,
        data: {
          requestId: params.requestId,
          deep_link: `/request/${params.requestId}`,
        },
      }),
    );

    if (!params.token) return null;
    return this.pushService.sendToToken({
      token: params.token,
      title,
      body,
      data: {
        type,
        requestId: params.requestId,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        deep_link: `/request/${params.requestId}`,
      },
    });
  }

  async notifyOfferRejected(params: {
    userId: string;
    token: string | null;
    jobTitle: string;
    requestId: string;
  }): Promise<string | null> {
    const title = `😔 Oferta no seleccionada`;
    const body = `El cliente eligió a otro trabajador para: ${params.jobTitle}`;
    const type = 'offer_rejected';

    await this.notificationRepository.save(
      this.notificationRepository.create({
        userId: params.userId,
        title,
        body,
        type,
        data: {
          requestId: params.requestId,
          deep_link: `/request/${params.requestId}`,
        },
      }),
    );

    if (!params.token) return null;
    return this.pushService.sendToToken({
      token: params.token,
      title,
      body,
      data: {
        type,
        requestId: params.requestId,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        deep_link: `/request/${params.requestId}`,
      },
    });
  }

  async notifyNewReview(params: {
    userId: string;
    token: string | null;
    clientName: string;
    stars: number;
    jobTitle: string;
    requestId: string;
  }): Promise<string | null> {
    const starsEmoji = '⭐'.repeat(Math.min(params.stars, 5));
    const title = `${starsEmoji} Nueva calificación`;
    const body = `${params.clientName} te calificó con ${params.stars} estrellas en: ${params.jobTitle}`;
    const type = 'new_review';

    await this.notificationRepository.save(
      this.notificationRepository.create({
        userId: params.userId,
        title,
        body,
        type,
        data: {
          requestId: params.requestId,
          stars: params.stars,
          deep_link: `/profile`,
        },
      }),
    );

    if (!params.token) return null;
    return this.pushService.sendToToken({
      token: params.token,
      title,
      body,
      data: {
        type,
        requestId: params.requestId,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        deep_link: `/profile`,
      },
    });
  }

  async notifyClientConfirmedArrival(params: {
    userId: string;
    token: string | null;
    clientName: string;
    jobTitle: string;
    requestId: string;
  }): Promise<string | null> {
    const title = `✅ Llegada confirmada`;
    const body = `${params.clientName} confirmó tu llegada. Ya puedes iniciar: ${params.jobTitle}`;
    const type = 'arrival_confirmed';

    await this.notificationRepository.save(
      this.notificationRepository.create({
        userId: params.userId,
        title,
        body,
        type,
        data: {
          requestId: params.requestId,
          deep_link: `/request/${params.requestId}`,
        },
      }),
    );

    if (!params.token) return null;
    return this.pushService.sendToToken({
      token: params.token,
      title,
      body,
      data: {
        type,
        requestId: params.requestId,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        deep_link: `/request/${params.requestId}`,
      },
    });
  }

  async notifyDisputeResolved(params: {
    userId: string;
    token: string | null;
    resolution: string;
    disputeId: string;
  }): Promise<string | null> {
    const title = `📋 Tu queja fue resuelta`;
    const body =
      params.resolution.length > 80
        ? params.resolution.substring(0, 80) + '...'
        : params.resolution;
    const type = 'dispute_resolved';

    await this.notificationRepository.save(
      this.notificationRepository.create({
        userId: params.userId,
        title,
        body,
        type,
        data: { disputeId: params.disputeId, deep_link: `/support` },
      }),
    );

    if (!params.token) return null;
    return this.pushService.sendToToken({
      token: params.token,
      title,
      body,
      data: {
        type,
        disputeId: params.disputeId,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        deep_link: `/support`,
      },
    });
  }

  async notifyDisputeCreated(params: {
    userId: string;
    token: string | null;
    reason: string;
    disputeId: string;
  }): Promise<string | null> {
    const title = `⚠️ Se abrió una queja`;
    const body = `Motivo: ${params.reason.length > 60 ? params.reason.substring(0, 60) + '...' : params.reason}`;
    const type = 'dispute_created';

    await this.notificationRepository.save(
      this.notificationRepository.create({
        userId: params.userId,
        title,
        body,
        type,
        data: { disputeId: params.disputeId, deep_link: `/support` },
      }),
    );

    if (!params.token) return null;
    return this.pushService.sendToToken({
      token: params.token,
      title,
      body,
      data: {
        type,
        disputeId: params.disputeId,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        deep_link: `/support`,
      },
    });
  }

  async notifyClientToImproveOffer(params: {
    userId: string;
    token: string | null;
    jobTitle: string;
    requestId: string;
  }): Promise<string | null> {
    const title = `⚠️ Nadie ha aceptado tu solicitud aún`;
    const body = `Sube tu presupuesto en: ${params.jobTitle} para atraer más trabajadores.`;
    const type = 'improve_offer_reminder';

    await this.notificationRepository.save(
      this.notificationRepository.create({
        userId: params.userId,
        title,
        body,
        type,
        data: {
          requestId: params.requestId,
          deep_link: `/request/${params.requestId}`,
        },
      }),
    );

    if (!params.token) return null;
    return this.pushService.sendToToken({
      token: params.token,
      title,
      body,
      data: {
        type,
        requestId: params.requestId,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        deep_link: `/request/${params.requestId}`,
      },
    });
  }

  async notifyClientTimeout(params: {
    userId: string;
    token: string | null;
    jobTitle: string;
    requestId: string;
  }): Promise<string | null> {
    const title = `⏱️ Solicitud expirada`;
    const body = `Tu solicitud ${params.jobTitle} se ha cancelado por falta de trabajadores disponibles.`;
    const type = 'request_timeout';

    await this.notificationRepository.save(
      this.notificationRepository.create({
        userId: params.userId,
        title,
        body,
        type,
        data: {
          requestId: params.requestId,
          deep_link: `/request/${params.requestId}`,
        },
      }),
    );

    if (!params.token) return null;
    return this.pushService.sendToToken({
      token: params.token,
      title,
      body,
      data: {
        type,
        requestId: params.requestId,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        deep_link: `/request/${params.requestId}`,
      },
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

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepository.count({
      where: { userId, isRead: false },
    });
  }

  async markNotificationsAsRead(userId: string): Promise<void> {
    await this.notificationRepository.update(
      { userId, isRead: false },
      { isRead: true },
    );
  }
}
