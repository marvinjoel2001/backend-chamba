import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../../notifications/notifications.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';

@Injectable()
export class MobileDisputesService {
  private readonly logger = new Logger(MobileDisputesService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  public async listDisputes(params?: { status?: string }) {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT d.id,
             d.request_id,
             d.reported_by,
             d.reported_user,
             d.reason,
             d.description,
             d.status,
             d.resolution,
             d.resolved_by,
             d.resolved_at,
             d.created_at,
             d.updated_at,
             jr.title AS request_title,
             jr.status AS request_status,
             reporter.first_name AS reporter_first_name,
             reporter.last_name AS reporter_last_name,
             reporter.type AS reporter_type,
             reported.first_name AS reported_first_name,
             reported.last_name AS reported_last_name,
             reported.type AS reported_type
      FROM disputes d
      LEFT JOIN job_requests jr ON jr.id = d.request_id
      JOIN users reporter ON reporter.id = d.reported_by
      LEFT JOIN users reported ON reported.id = d.reported_user
      WHERE ($1::text IS NULL OR d.status = $1)
      ORDER BY d.created_at DESC
      LIMIT 500
      `,
      [params?.status || null],
    );

    return {
      disputes: rows.map((r) => ({
        id: r.id,
        requestId: r.request_id,
        requestTitle: r.request_title,
        requestStatus: r.request_status,
        reportedBy: r.reported_by,
        reporterName: [r.reporter_first_name, r.reporter_last_name]
          .filter(Boolean)
          .join(' '),
        reporterType: r.reporter_type,
        reportedUser: r.reported_user,
        reportedName: [r.reported_first_name, r.reported_last_name]
          .filter(Boolean)
          .join(' '),
        reportedType: r.reported_type,
        reason: r.reason,
        description: r.description ?? '',
        status: r.status,
        resolution: r.resolution,
        resolvedBy: r.resolved_by,
        resolvedAt: r.resolved_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    };
  }

  public async createDispute(params: {
    requestId?: string;
    reportedBy: string;
    reportedUser?: string;
    reason: string;
    description?: string;
  }) {
    if (!params.reportedBy || !params.reason?.trim()) {
      throw new BadRequestException(
        'El usuario reportante y la razón del reporte son obligatorios.',
      );
    }

    const rows = await this.dataSource.query<any[]>(
      `
      INSERT INTO disputes (request_id, reported_by, reported_user, reason, description)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, status, created_at
      `,
      [
        params.requestId || null,
        params.reportedBy,
        params.reportedUser || null,
        params.reason.trim(),
        params.description?.trim() || null,
      ],
    );

    if (params.reportedUser) {
      const tokenRows = await this.dataSource.query<any[]>(
        `SELECT token AS push_token FROM push_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1`,
        [params.reportedUser],
      );
      this.notificationsService
        .notifyDisputeCreated({
          userId: params.reportedUser,
          token: tokenRows[0]?.push_token || null,
          reason: params.reason,
          disputeId: rows[0].id,
        })
        .catch((e) => this.logger.error('Failed to notify dispute created', e));
    }

    return {
      dispute: {
        id: rows[0].id,
        status: rows[0].status,
        createdAt: rows[0].created_at,
      },
    };
  }

  public async resolveDispute(params: {
    disputeId: string;
    resolution: string;
    resolvedBy: string;
  }) {
    if (!params.disputeId || !params.resolution?.trim()) {
      throw new BadRequestException('disputeId and resolution are required');
    }

    await this.dataSource.query(
      `
      UPDATE disputes
      SET status = 'resolved',
          resolution = $2,
          resolved_by = $3,
          resolved_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      `,
      [
        params.disputeId,
        params.resolution.trim(),
        params.resolvedBy || 'admin',
      ],
    );

    const disputeRows = await this.dataSource.query<any[]>(
      `SELECT reported_by FROM disputes WHERE id = $1 LIMIT 1`,
      [params.disputeId],
    );
    if (disputeRows[0]?.reported_by) {
      const userId = disputeRows[0].reported_by;
      const tokenRows = await this.dataSource.query<any[]>(
        `SELECT token AS push_token FROM push_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1`,
        [userId],
      );
      this.notificationsService
        .notifyDisputeResolved({
          userId,
          token: tokenRows[0]?.push_token || null,
          resolution: params.resolution,
          disputeId: params.disputeId,
        })
        .catch((e) =>
          this.logger.error('Failed to notify dispute resolved', e),
        );
    }

    return { disputeId: params.disputeId, status: 'resolved' };
  }

  public async getDisputeMessages(disputeId: string, readBy?: string) {
    if (readBy === 'user') {
      await this.dataSource.query(
        `UPDATE disputes SET user_last_read_at = NOW() WHERE id = $1`,
        [disputeId],
      );
    } else if (readBy === 'admin') {
      await this.dataSource.query(
        `UPDATE disputes SET admin_last_read_at = NOW() WHERE id = $1`,
        [disputeId],
      );
    }

    const rows = await this.dataSource.query<any[]>(
      `
      SELECT dm.id,
             dm.dispute_id,
             dm.sender_type,
             dm.sender_id,
             dm.content,
             dm.created_at,
             u.first_name AS sender_first_name,
             u.last_name AS sender_last_name
      FROM dispute_messages dm
      LEFT JOIN users u ON u.id = dm.sender_id
      WHERE dm.dispute_id = $1
      ORDER BY dm.created_at ASC
      LIMIT 500
      `,
      [disputeId],
    );

    return {
      messages: rows.map((r) => ({
        id: r.id,
        disputeId: r.dispute_id,
        senderType: r.sender_type,
        senderId: r.sender_id,
        senderName:
          [r.sender_first_name, r.sender_last_name].filter(Boolean).join(' ') ||
          'Soporte',
        content: r.content,
        createdAt: r.created_at,
      })),
    };
  }

  public async getUserActiveDisputes(userId: string) {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT d.id, d.request_id, d.reported_by, d.reported_user, d.reason,
             d.description, d.status, d.resolution, d.resolved_by,
             d.resolved_at, d.created_at, d.updated_at,
             jr.title AS request_title,
             (
               SELECT COUNT(*)::int
               FROM dispute_messages dm
               WHERE dm.dispute_id = d.id
                 AND dm.sender_type = 'admin'
                 AND (d.user_last_read_at IS NULL OR dm.created_at > d.user_last_read_at)
             ) AS unread_count
      FROM disputes d
      LEFT JOIN job_requests jr ON jr.id = d.request_id
      WHERE d.reported_by = $1
        AND (d.status = 'open' OR (d.status = 'resolved' AND d.resolved_at >= NOW() - INTERVAL '3 days'))
      ORDER BY d.created_at DESC
      LIMIT 100
      `,
      [userId],
    );

    return {
      disputes: rows.map((r) => ({
        id: r.id,
        requestId: r.request_id,
        requestTitle: r.request_title,
        reportedBy: r.reported_by,
        reportedUser: r.reported_user,
        reason: r.reason,
        description: r.description,
        status: r.status,
        resolution: r.resolution,
        resolvedBy: r.resolved_by,
        resolvedAt: r.resolved_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        unreadCount: r.unread_count,
      })),
    };
  }

  public async sendDisputeMessage(params: {
    disputeId: string;
    senderType: string;
    senderId?: string;
    content: string;
  }) {
    if (!params.content?.trim()) {
      throw new BadRequestException('content is required');
    }

    const rows = await this.dataSource.query<any[]>(
      `
      INSERT INTO dispute_messages (dispute_id, sender_type, sender_id, content)
      VALUES ($1, $2, $3, $4)
      RETURNING id, created_at
      `,
      [
        params.disputeId,
        params.senderType || 'user',
        params.senderId || null,
        params.content.trim(),
      ],
    );

    this.realtimeGateway.server.emit('dispute.message', {
      disputeId: params.disputeId,
      messageId: rows[0].id,
      senderType: params.senderType,
      timestamp: rows[0].created_at,
    });

    if (params.senderType === 'admin') {
      const disputeRows = await this.dataSource.query<any[]>(
        `SELECT reported_by FROM disputes WHERE id = $1 LIMIT 1`,
        [params.disputeId],
      );
      const userId = disputeRows[0]?.reported_by;
      if (userId) {
        const tokenRows = await this.dataSource.query<any[]>(
          `SELECT token AS push_token FROM push_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1`,
          [userId],
        );
        await this.notificationsService
          .notifySupportMessage({
            userId,
            token: tokenRows[0]?.push_token || null,
            message: params.content,
          })
          .catch((e) =>
            this.logger.error('Failed to notify support message', e),
          );
      }
    }

    return { messageId: rows[0].id, createdAt: rows[0].created_at };
  }

  public async getUserDisputes(userId: string) {
    const madeRows = await this.dataSource.query<any[]>(
      `
      SELECT d.id, d.request_id, d.reported_by, d.reported_user, d.reason,
             d.description, d.status, d.resolution, d.resolved_by,
             d.resolved_at, d.created_at, d.updated_at,
             u_by.first_name AS reporter_first_name,
             u_by.last_name AS reporter_last_name,
             u_by.type AS reporter_type,
             u_rep.first_name AS reported_first_name,
             u_rep.last_name AS reported_last_name,
             u_rep.type AS reported_type,
             jr.title AS request_title
      FROM disputes d
      LEFT JOIN users u_by ON u_by.id = d.reported_by
      LEFT JOIN users u_rep ON u_rep.id = d.reported_user
      LEFT JOIN job_requests jr ON jr.id = d.request_id
      WHERE d.reported_by = $1
      ORDER BY d.created_at DESC
      LIMIT 100
      `,
      [userId],
    );

    const receivedRows = await this.dataSource.query<any[]>(
      `
      SELECT d.id, d.request_id, d.reported_by, d.reported_user, d.reason,
             d.description, d.status, d.resolution, d.resolved_by,
             d.resolved_at, d.created_at, d.updated_at,
             u_by.first_name AS reporter_first_name,
             u_by.last_name AS reporter_last_name,
             u_by.type AS reporter_type,
             u_rep.first_name AS reported_first_name,
             u_rep.last_name AS reported_last_name,
             u_rep.type AS reported_type,
             jr.title AS request_title
      FROM disputes d
      LEFT JOIN users u_by ON u_by.id = d.reported_by
      LEFT JOIN users u_rep ON u_rep.id = d.reported_user
      LEFT JOIN job_requests jr ON jr.id = d.request_id
      WHERE d.reported_user = $1
      ORDER BY d.created_at DESC
      LIMIT 100
      `,
      [userId],
    );

    const mapRow = (r: any) => ({
      id: r.id,
      requestId: r.request_id,
      requestTitle: r.request_title,
      reason: r.reason,
      description: r.description,
      status: r.status,
      resolution: r.resolution,
      resolvedBy: r.resolved_by,
      resolvedAt: r.resolved_at,
      createdAt: r.created_at,
      reporterName: [r.reporter_first_name, r.reporter_last_name]
        .filter(Boolean)
        .join(' '),
      reporterType: r.reporter_type,
      reportedName: [r.reported_first_name, r.reported_last_name]
        .filter(Boolean)
        .join(' '),
      reportedType: r.reported_type,
    });

    return {
      made: madeRows.map(mapRow),
      received: receivedRows.map(mapRow),
    };
  }
}
