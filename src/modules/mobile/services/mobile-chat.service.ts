import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import { JobChatPhotoService } from './job-chat-photo.service';
import {
  CHAT_CONTACT_ALERT,
  CHAT_HISTORY_STATUSES,
  CHAT_WRITABLE_STATUSES,
  containsExternalContact,
} from '../shared/job-chat-policy';
import { NotificationsService } from '../../notifications/notifications.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { MobileRequestRepository } from '../shared/mobile-request.repository';

@Injectable()
export class MobileChatService {
  private readonly logger = new Logger(MobileChatService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeGateway: RealtimeGateway,
    public readonly repo: MobileRequestRepository,
    private readonly photoPolicy: JobChatPhotoService,
    private readonly storage: StorageService,
  ) {}

  private async getContext(
    threadId: string,
    userId: string,
    db: Pick<DataSource, 'query'> = this.dataSource,
    lock = false,
  ) {
    if (!userId) throw new ForbiddenException('Sesión requerida');
    const [thread] = await db.query(
      `
      SELECT t.id, t.request_id, t.client_user_id, t.worker_user_id,
        jr.title, jr.description, jr.category, jr.status, jo.amount,
        u.first_name, u.last_name, u.profile_photo_url
      FROM chat_threads t
      JOIN job_requests jr ON jr.id = t.request_id AND jr.client_user_id = t.client_user_id
      JOIN job_offers jo ON jo.request_id = t.request_id
        AND jo.worker_user_id = t.worker_user_id AND jo.status = 'accepted'
      JOIN users u ON u.id = CASE WHEN t.client_user_id = $2 THEN t.worker_user_id ELSE t.client_user_id END
      WHERE t.id = $1 AND (t.client_user_id = $2 OR t.worker_user_id = $2)
      ${lock ? 'FOR UPDATE OF jr' : ''}`,
      [threadId, userId],
    );
    if (!thread || !CHAT_HISTORY_STATUSES.includes(thread.status)) {
      throw new ForbiddenException(
        'El chat se habilita al aceptar una oferta de este trabajo.',
      );
    }
    return thread;
  }

  public async getMessages(userId: string) {
    await this.repo.getUserById(userId);

    const rows = await this.dataSource.query<any[]>(
      `
      SELECT t.id AS thread_id,
             t.request_id,
             jr.title AS request_title,
             jr.description AS request_description,
             jr.status AS request_status,
             jo.amount AS request_budget,
             jr.category AS request_category,
             t.worker_user_id AS request_worker_id,
             t.client_user_id AS request_client_id,
             CASE WHEN t.client_user_id = $1 THEN t.worker_user_id ELSE t.client_user_id END AS counterpart_id,
             u.first_name AS counterpart_first_name,
             u.last_name AS counterpart_last_name,
             u.profile_photo_url AS counterpart_photo,
             lm.content AS last_message,
             lm.created_at AS last_message_at,
             (
               SELECT COUNT(*)::int
               FROM chat_messages m2
               WHERE m2.thread_id = t.id
                 AND m2.sender_user_id <> $1
                 AND (
                   (t.client_user_id = $1 AND (t.client_last_read_at IS NULL OR m2.created_at > t.client_last_read_at))
                   OR
                   (t.worker_user_id = $1 AND (t.worker_last_read_at IS NULL OR m2.created_at > t.worker_last_read_at))
                 )
             ) AS unread_count
      FROM chat_threads t
      JOIN users u
        ON u.id = CASE WHEN t.client_user_id = $1 THEN t.worker_user_id ELSE t.client_user_id END
      JOIN job_requests jr ON jr.id = t.request_id AND jr.client_user_id = t.client_user_id
      JOIN job_offers jo ON jo.request_id = t.request_id
        AND jo.worker_user_id = t.worker_user_id AND jo.status = 'accepted'
      LEFT JOIN LATERAL (
        SELECT m.content, m.created_at
        FROM chat_messages m
        WHERE m.thread_id = t.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) lm ON true
      WHERE (t.client_user_id = $1 OR t.worker_user_id = $1)
        AND jr.status IN ('assigned', 'in_progress', 'completed', 'cancelled')
      ORDER BY COALESCE(lm.created_at, t.updated_at) DESC
      `,
      [userId],
    );

    return {
      threads: rows.map((row) => ({
        id: row.thread_id,
        requestId: row.request_id ?? null,
        request: row.request_id
          ? {
              id: row.request_id,
              title: row.request_title,
              description: row.request_description,
              status: row.request_status,
              budget: row.request_budget,
              category: row.request_category,
              workerId: row.request_worker_id,
              clientId: row.request_client_id,
            }
          : null,
        counterpart: {
          id: row.counterpart_id,
          firstName: row.counterpart_first_name,
          lastName: row.counterpart_last_name ?? '',
          profilePhotoUrl: row.counterpart_photo ?? null,
        },
        lastMessage: row.last_message ?? 'Sin mensajes',
        lastMessageAt: row.last_message_at ?? null,
        unreadCount: row.unread_count ?? 0,
        hasUnreadMessages: (row.unread_count ?? 0) > 0,
        chatEnabled: true,
        canSend: CHAT_WRITABLE_STATUSES.includes(row.request_status),
        type: CHAT_WRITABLE_STATUSES.includes(row.request_status)
          ? 'active'
          : 'archived',
      })),
    };
  }

  /// Marca como leídos los mensajes de una conversación para el usuario dado.
  /// Registra el instante de lectura en la columna correspondiente según el
  /// usuario sea el cliente o el trabajador del hilo.
  public async markThreadRead(threadId: string, userId: string) {
    await this.getContext(threadId, userId);
    await this.dataSource.query(
      `
      UPDATE chat_threads
      SET client_last_read_at = CASE WHEN client_user_id = $2 THEN NOW() ELSE client_last_read_at END,
          worker_last_read_at = CASE WHEN worker_user_id = $2 THEN NOW() ELSE worker_last_read_at END
      WHERE id = $1
      `,
      [threadId, userId],
    );
    return { ok: true };
  }

  public async getThreadMessages(
    threadId: string,
    opts: { userId: string; limit?: number; before?: string },
  ) {
    const thread = await this.getContext(threadId, opts.userId);

    const limit = Math.min(200, Math.max(1, Math.floor(opts?.limit ?? 100)));
    const before =
      opts?.before && !Number.isNaN(Date.parse(opts.before))
        ? new Date(opts.before).toISOString()
        : null;

    const rows = await this.dataSource.query<any[]>(
      `
      SELECT id, sender_user_id, content, created_at
      FROM chat_messages
      WHERE thread_id = $1
        AND ($2::timestamptz IS NULL OR created_at < $2::timestamptz)
      ORDER BY created_at DESC
      LIMIT $3
      `,
      [threadId, before, limit + 1],
    );

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    page.reverse();

    return {
      threadId,
      hasMore,
      context: {
        id: threadId,
        requestId: thread.request_id,
        request: {
          id: thread.request_id,
          title: thread.title,
          description: thread.description,
          category: thread.category,
          status: thread.status,
          budget: thread.amount,
          workerId: thread.worker_user_id,
          clientId: thread.client_user_id,
        },
        counterpart: {
          firstName: thread.first_name,
          lastName: thread.last_name,
          profilePhotoUrl: thread.profile_photo_url,
        },
        chatEnabled: true,
        canSend: CHAT_WRITABLE_STATUSES.includes(thread.status),
        type: CHAT_WRITABLE_STATUSES.includes(thread.status)
          ? 'active'
          : 'archived',
      },
      messages: page.map((row) => ({
        id: row.id,
        threadId,
        senderUserId: row.sender_user_id,
        content: row.content,
        createdAt: row.created_at,
      })),
    };
  }

  public async archiveThread(params: { threadId: string; userId: string }) {
    await this.getContext(params.threadId, params.userId);
    return { success: true };
  }

  public async deleteThread(params: { threadId: string; userId: string }) {
    await this.getContext(params.threadId, params.userId);
    throw new BadRequestException(
      'El historial del trabajo se conserva y no puede eliminarse.',
    );
  }

  public async sendMessage(params: {
    threadId: string;
    senderUserId: string;
    content: string;
  }) {
    if (
      typeof params.content !== 'string' ||
      !params.content.trim() ||
      params.content.length > 2000
    ) {
      throw new BadRequestException(
        'Escribe un mensaje de hasta 2000 caracteres.',
      );
    }
    if (containsExternalContact(params.content))
      throw new BadRequestException(CHAT_CONTACT_ALERT);
    return this.persistMessage({ ...params, content: params.content.trim() });
  }

  public async sendPhoto(params: {
    threadId: string;
    senderUserId: string;
    imageBase64: string;
    caption?: string;
  }) {
    const thread = await this.getContext(params.threadId, params.senderUserId);
    if (!CHAT_WRITABLE_STATUSES.includes(thread.status)) {
      throw new BadRequestException(
        'Este trabajo terminó. El chat está en modo solo lectura.',
      );
    }
    const caption = params.caption ?? '';
    if (typeof caption !== 'string' || caption.length > 2000)
      throw new BadRequestException('La descripción es demasiado larga.');
    if (containsExternalContact(caption))
      throw new BadRequestException(CHAT_CONTACT_ALERT);
    const image = await this.photoPolicy.validate(params.imageBase64);
    const upload = await this.storage.uploadBase64Image({
      base64Data: `data:image/jpeg;base64,${image.toString('base64')}`,
      folder: `job_chat/${params.threadId}`,
    });
    try {
      return await this.persistMessage({
        threadId: params.threadId,
        senderUserId: params.senderUserId,
        content: `[Foto]\n${upload.url}\n${caption.trim()}`.trim(),
      });
    } catch (error) {
      await this.storage.deleteImage(upload.publicId).catch(() => undefined);
      throw error;
    }
  }

  private async persistMessage(params: {
    threadId: string;
    senderUserId: string;
    content: string;
  }) {
    // Lock the request through insertion: completing/cancelling cannot race a send.
    const { rows, thread } = await this.dataSource.transaction(
      async (manager) => {
        const thread = await this.getContext(
          params.threadId,
          params.senderUserId,
          manager,
          true,
        );
        if (!CHAT_WRITABLE_STATUSES.includes(thread.status)) {
          throw new BadRequestException(
            'Este trabajo terminó. El chat está en modo solo lectura.',
          );
        }
        const rows = await manager.query(
          `
        INSERT INTO chat_messages (thread_id, sender_user_id, content)
        VALUES ($1, $2, $3) RETURNING id, sender_user_id, content, created_at`,
          [params.threadId, params.senderUserId, params.content],
        );
        await manager.query(
          `UPDATE chat_threads SET updated_at = NOW() WHERE id = $1`,
          [params.threadId],
        );
        return { rows, thread };
      },
    );
    const payload = {
      threadId: params.threadId,
      requestId: thread?.request_id ?? null,
      message: {
        id: rows[0].id,
        threadId: params.threadId,
        senderUserId: rows[0].sender_user_id,
        content: rows[0].content,
        createdAt: rows[0].created_at,
      },
    };
    if (thread?.client_user_id) {
      this.realtimeGateway.emitToUser(
        thread.client_user_id,
        'message.new',
        payload,
      );
    }
    if (thread?.worker_user_id) {
      this.realtimeGateway.emitToUser(
        thread.worker_user_id,
        'message.new',
        payload,
      );
    }

    const recipientUserId =
      params.senderUserId === thread?.client_user_id
        ? thread?.worker_user_id
        : thread?.client_user_id;
    if (recipientUserId) {
      this.notifyRecipientOfNewMessage({
        recipientUserId,
        senderUserId: params.senderUserId,
        message: params.content,
        messageId: rows[0].id,
        threadId: params.threadId,
        requestId: thread?.request_id,
        isSenderWorker: params.senderUserId === thread?.worker_user_id,
      }).catch((err) => {
        this.logger.warn(
          'Failed to send push notification for new message:',
          err.message,
        );
      });
    }

    return {
      message: {
        id: rows[0].id,
        threadId: params.threadId,
        senderUserId: rows[0].sender_user_id,
        content: rows[0].content,
        createdAt: rows[0].created_at,
      },
    };
  }

  private formatMessagePreview(rawContent: string): {
    preview: string;
    isMedia: boolean;
  } {
    if (!rawContent) return { preview: 'Te envió un mensaje', isMedia: false };
    const trimmed = rawContent.trim();

    // Image detection
    if (
      trimmed.startsWith('[Foto]') ||
      trimmed.startsWith('[Imagen]') ||
      /\.(jpeg|jpg|png|gif|webp)(\?.*)?$/i.test(trimmed) ||
      (trimmed.startsWith('http') &&
        (trimmed.includes('/image/upload/') ||
          trimmed.includes('cloudinary') ||
          trimmed.includes('/photos/')))
    ) {
      return { preview: '📷 Te envió una imagen', isMedia: true };
    }

    // Audio / Voice message detection
    if (
      trimmed.startsWith('[Audio]') ||
      trimmed.startsWith('[Voz]') ||
      /\.(mp3|m4a|wav|aac|ogg)(\?.*)?$/i.test(trimmed)
    ) {
      return { preview: '🎤 Te envió un mensaje de voz', isMedia: true };
    }

    // Location
    if (trimmed.startsWith('[Ubicación]') || trimmed.startsWith('[Location]')) {
      return { preview: '📍 Te envió una ubicación', isMedia: true };
    }

    // Document / file
    if (trimmed.startsWith('[Archivo]') || trimmed.startsWith('[Documento]')) {
      return { preview: '📎 Te envió un archivo', isMedia: true };
    }

    return {
      preview: trimmed.length > 80 ? trimmed.substring(0, 77) + '...' : trimmed,
      isMedia: false,
    };
  }

  public async notifyRecipientOfNewMessage(params: {
    recipientUserId: string;
    senderUserId: string;
    message: string;
    messageId?: string;
    threadId: string;
    requestId?: string | null;
    isSenderWorker: boolean;
  }): Promise<void> {
    let jobTitle: string | null = null;
    if (params.requestId) {
      const jobRows = await this.dataSource.query<any[]>(
        `SELECT title FROM job_requests WHERE id = $1 LIMIT 1`,
        [params.requestId],
      );
      if (jobRows[0]?.title) {
        jobTitle = jobRows[0].title;
      }
    }

    const { preview, isMedia } = this.formatMessagePreview(params.message);

    // Si el remitente es el worker, el receptor (cliente) lee: "Tu trabajador..."
    // Si el remitente es el cliente, el receptor (worker) lee: "Tu cliente..."
    const senderRoleLabel = params.isSenderWorker
      ? 'Tu trabajador'
      : 'Tu cliente';

    const title = jobTitle
      ? `💬 ${jobTitle}`
      : `💬 Mensaje de ${senderRoleLabel.toLowerCase()}`;

    const body = isMedia
      ? `${senderRoleLabel}: ${preview}`
      : jobTitle
        ? `${senderRoleLabel}: "${preview}"`
        : preview;

    const tokenRows = await this.dataSource.query<any[]>(
      `SELECT token AS push_token FROM push_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1`,
      [params.recipientUserId],
    );

    await this.notificationsService.notifyNewMessage({
      userId: params.recipientUserId,
      token: tokenRows[0]?.push_token || null,
      title,
      body,
      threadId: params.threadId,
      messageId: params.messageId,
    });
  }
}
