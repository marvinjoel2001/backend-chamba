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
             lm.content AS last_message,
             lm.created_at AS last_message_at
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
      WHERE t.client_user_id = $1 OR t.worker_user_id = $1
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
      })),
    };
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
      `UPDATE chat_threads SET updated_at = NOW() WHERE id = $1`,
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
      this.notifyRecipientOfNewMessage(
        recipientUserId,
        params.senderUserId,
        params.content,
        params.threadId,
      ).catch((err) => {
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

  public async notifyRecipientOfNewMessage(
    recipientUserId: string,
    senderUserId: string,
    message: string,
    threadId: string,
  ): Promise<void> {
    const senderRows = await this.dataSource.query<any[]>(
      `SELECT first_name, last_name FROM users WHERE id = $1`,
      [senderUserId],
    );
    const senderName = senderRows[0]
      ? `${senderRows[0].first_name} ${senderRows[0].last_name ?? ''}`.trim()
      : 'Alguien';

    const tokenRows = await this.dataSource.query<any[]>(
      `SELECT token AS push_token FROM push_tokens WHERE user_id = $1`,
      [recipientUserId],
    );
    if (!tokenRows[0]?.push_token) return;

    await this.notificationsService.notifyNewMessage({
      userId: recipientUserId,
      token: tokenRows[0].push_token,
      senderName,
      message,
      threadId,
    });
  }
}
