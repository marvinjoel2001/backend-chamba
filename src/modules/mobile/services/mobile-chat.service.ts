import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
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
  ) {}

  public async getMessages(userId: string) {
    await this.repo.getUserById(userId);

    const rows = await this.dataSource.query<any[]>(
      `
      SELECT t.id AS thread_id,
             t.request_id,
             jr.title AS request_title,
             jr.description AS request_description,
             jr.status AS request_status,
             jr.budget AS request_budget,
             jr.category AS request_category,
             t.worker_user_id AS request_worker_id,
             t.client_user_id AS request_client_id,
             CASE WHEN t.client_user_id = $1 THEN t.worker_user_id ELSE t.client_user_id END AS counterpart_id,
             u.first_name AS counterpart_first_name,
             u.last_name AS counterpart_last_name,
             u.profile_photo_url AS counterpart_photo,
             u.phone AS counterpart_phone,
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
      LEFT JOIN job_requests jr ON jr.id = t.request_id
      LEFT JOIN LATERAL (
        SELECT m.content, m.created_at
        FROM chat_messages m
        WHERE m.thread_id = t.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) lm ON true
      WHERE (t.client_user_id = $1 AND COALESCE(t.client_deleted, false) = false)
         OR (t.worker_user_id = $1 AND COALESCE(t.worker_deleted, false) = false)
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
          phone: row.counterpart_phone ?? null,
        },
        lastMessage: row.last_message ?? 'Sin mensajes',
        lastMessageAt: row.last_message_at ?? null,
        unreadCount: row.unread_count ?? 0,
        hasUnreadMessages: (row.unread_count ?? 0) > 0,
      })),
    };
  }

  /// Marca como leídos los mensajes de una conversación para el usuario dado.
  /// Registra el instante de lectura en la columna correspondiente según el
  /// usuario sea el cliente o el trabajador del hilo.
  public async markThreadRead(threadId: string, userId: string) {
    await this.repo.ensureThreadExists(threadId);
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
    opts?: { limit?: number; before?: string },
  ) {
    await this.repo.ensureThreadExists(threadId);

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
      messages: page.map((row) => ({
        id: row.id,
        senderUserId: row.sender_user_id,
        content: row.content,
        createdAt: row.created_at,
      })),
    };
  }

  public async archiveThread(params: { threadId: string; userId: string }) {
    await this.repo.ensureThreadExists(params.threadId);
    return { success: true };
  }

  public async deleteThread(params: { threadId: string; userId: string }) {
    await this.repo.ensureThreadExists(params.threadId);
    await this.dataSource.query(
      `
      UPDATE chat_threads
      SET client_deleted = CASE WHEN client_user_id = $2 THEN true ELSE client_deleted END,
          worker_deleted = CASE WHEN worker_user_id = $2 THEN true ELSE worker_deleted END
      WHERE id = $1
      `,
      [params.threadId, params.userId],
    );
    return { success: true };
  }

  public async sendMessage(params: {
    threadId: string;
    senderUserId: string;
    content: string;
  }) {
    if (!params.content?.trim()) {
      throw new BadRequestException('content is required');
    }

    await this.repo.getUserById(params.senderUserId);
    await this.repo.ensureThreadExists(params.threadId);

    const rows = await this.dataSource.query<any[]>(
      `
      INSERT INTO chat_messages (thread_id, sender_user_id, content)
      VALUES ($1, $2, $3)
      RETURNING id, sender_user_id, content, created_at
      `,
      [params.threadId, params.senderUserId, params.content.trim()],
    );

    await this.dataSource.query(
      `UPDATE chat_threads SET updated_at = NOW(), client_deleted = false, worker_deleted = false WHERE id = $1`,
      [params.threadId],
    );

    const threadRows = await this.dataSource.query<any[]>(
      `
      SELECT request_id, client_user_id, worker_user_id
      FROM chat_threads
      WHERE id = $1
      LIMIT 1
      `,
      [params.threadId],
    );

    const thread = threadRows[0];
    const payload = {
      threadId: params.threadId,
      requestId: thread?.request_id ?? null,
      message: {
        id: rows[0].id,
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
        senderUserId: rows[0].sender_user_id,
        content: rows[0].content,
        createdAt: rows[0].created_at,
      },
    };
  }

  private formatMessagePreview(rawContent: string): { preview: string; isMedia: boolean } {
    if (!rawContent) return { preview: 'Te envió un mensaje', isMedia: false };
    const trimmed = rawContent.trim();

    // Image detection
    if (
      trimmed.startsWith('[Foto]') ||
      trimmed.startsWith('[Imagen]') ||
      /\.(jpeg|jpg|png|gif|webp)(\?.*)?$/i.test(trimmed) ||
      (trimmed.startsWith('http') && (trimmed.includes('/image/upload/') || trimmed.includes('cloudinary') || trimmed.includes('/photos/')))
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
    const senderRoleLabel = params.isSenderWorker ? 'Tu trabajador' : 'Tu cliente';

    const title = jobTitle
      ? `💬 ${jobTitle}`
      : `💬 Mensaje de ${senderRoleLabel.toLowerCase()}`;

    const body = isMedia
      ? `${senderRoleLabel}: ${preview}`
      : (jobTitle ? `${senderRoleLabel}: "${preview}"` : preview);

    const tokenRows = await this.dataSource.query<any[]>(
      `SELECT token AS push_token FROM push_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1`,
      [params.recipientUserId],
    );
    if (!tokenRows[0]?.push_token) return;

    await this.notificationsService.notifyNewMessage({
      userId: params.recipientUserId,
      token: tokenRows[0].push_token,
      title,
      body,
      threadId: params.threadId,
    });
  }
}
