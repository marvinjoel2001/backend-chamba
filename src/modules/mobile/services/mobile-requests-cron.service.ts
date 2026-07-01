import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../../notifications/notifications.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';

@Injectable()
export class MobileRequestsCronService {
  private readonly logger = new Logger(MobileRequestsCronService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleRequestTimeouts() {
    this.logger.debug('Running request timeout check...');
    
    // Obtenemos todas las solicitudes en estado 'searching'
    const rows = await this.dataSource.query<any[]>(`
      SELECT jr.id, jr.title, jr.client_user_id, jr.price_type, jr.scheduled_at, jr.created_at, jr.reminder_level, pt.token
      FROM job_requests jr
      LEFT JOIN push_tokens pt ON pt.user_id = jr.client_user_id
      WHERE jr.status = 'searching'
    `);

    const now = new Date();

    for (const req of rows) {
      const createdAt = new Date(req.created_at);
      const scheduledAt = req.scheduled_at ? new Date(req.scheduled_at) : null;
      const priceType = String(req.price_type || '').toLowerCase();
      
      let isHourly = priceType.includes('hora') || priceType.includes('hour');
      let isDaily = priceType.includes('dia') || priceType.includes('day');
      let isFixed = !isHourly && !isDaily;

      const elapsedMs = now.getTime() - createdAt.getTime();
      const elapsedMinutes = elapsedMs / (1000 * 60);

      let timeoutMinutes = 120; // default 2 hours for fixed
      let reminder1Minutes = 30;
      let reminder2Minutes = 60;

      if (isHourly) {
        timeoutMinutes = 30;
        reminder1Minutes = 10;
        reminder2Minutes = 20;
      } else if (isDaily) {
        timeoutMinutes = 12 * 60; // 12 hours
        reminder1Minutes = 2 * 60; // 2 hours
        reminder2Minutes = 6 * 60; // 6 hours
      }

      if (scheduledAt) {
        // Cancelar si falta menos de 1 hora o ya pasó
        const msUntilScheduled = scheduledAt.getTime() - now.getTime();
        const minutesUntilScheduled = msUntilScheduled / (1000 * 60);
        
        if (minutesUntilScheduled <= 60) {
           await this.cancelRequest(req, 'timeout');
           continue;
        }

        // Si falta mucho, ajustamos recordatorios a la mitad del camino
        const totalDurationMs = scheduledAt.getTime() - createdAt.getTime();
        const totalDurationMins = totalDurationMs / (1000 * 60);
        reminder1Minutes = totalDurationMins / 2;
        reminder2Minutes = totalDurationMins - 120; // 2 horas antes
        if (reminder2Minutes < reminder1Minutes) {
           reminder2Minutes = reminder1Minutes + 30;
        }
      } else {
        if (elapsedMinutes >= timeoutMinutes) {
          await this.cancelRequest(req, 'timeout');
          continue;
        }
      }

      // Check reminders
      const currentLevel = Number(req.reminder_level || 0);

      if (elapsedMinutes >= reminder1Minutes && currentLevel < 1) {
        await this.sendReminder(req, 1);
      } else if (elapsedMinutes >= reminder2Minutes && currentLevel < 2) {
        await this.sendReminder(req, 2);
      }
    }
  }

  private async cancelRequest(req: any, reason: string) {
    this.logger.log(`Cancelling request ${req.id} due to ${reason}`);
    await this.dataSource.query(
      `UPDATE job_requests SET status = 'cancelled', cancelled_by = 'system', updated_at = NOW() WHERE id = $1`,
      [req.id]
    );

    this.realtimeGateway.emitToUser(req.client_user_id, 'job.cancelled', {
      requestId: req.id,
      reason: reason,
      cancelerUserId: 'system'
    });

    this.realtimeGateway.server.emit('request.status.updated', {
      requestId: req.id,
      status: 'cancelled',
      timestamp: new Date().toISOString(),
    });

    await this.notificationsService.notifyClientTimeout({
      userId: req.client_user_id,
      token: req.token,
      jobTitle: req.title,
      requestId: req.id
    }).catch(e => this.logger.error('Error sending timeout push', e));
  }

  private async sendReminder(req: any, newLevel: number) {
    this.logger.log(`Sending reminder level ${newLevel} for request ${req.id}`);
    await this.dataSource.query(
      `UPDATE job_requests SET reminder_level = $1 WHERE id = $2`,
      [newLevel, req.id]
    );

    this.realtimeGateway.emitToUser(req.client_user_id, 'job.reminder', {
      requestId: req.id,
      level: newLevel
    });

    await this.notificationsService.notifyClientToImproveOffer({
      userId: req.client_user_id,
      token: req.token,
      jobTitle: req.title,
      requestId: req.id
    }).catch(e => this.logger.error('Error sending reminder push', e));
  }
}
