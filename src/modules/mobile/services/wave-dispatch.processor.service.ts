import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Worker, Job } from 'bullmq';
import { NotificationsService } from '../../notifications/notifications.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { WAVE_QUEUE_NAME, WaveJobData } from '../../queues/wave-dispatch.queue.service';

@Injectable()
export class WaveDispatchProcessorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WaveDispatchProcessorService.name);
  private worker: Worker<WaveJobData> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  onModuleInit(): void {
    if (this.configService.get('USE_QUEUE_DISPATCH') !== 'true') {
      return;
    }
    this.worker = new Worker<WaveJobData>(
      WAVE_QUEUE_NAME,
      async (job: Job<WaveJobData>) => {
        await this.processWave(job.data);
      },
      { connection: this.buildConnection() },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`Wave job ${job.id} completed`);
    });
    this.worker.on('failed', (job, err) => {
      this.logger.error(`Wave job ${job?.id} failed: ${err.message}`);
    });

    this.logger.log(`BullMQ worker for "${WAVE_QUEUE_NAME}" started`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async processWave(params: WaveJobData): Promise<void> {
    const requestRows = await this.dataSource.query<any[]>(
      `SELECT status FROM job_requests WHERE id = $1 LIMIT 1`,
      [params.requestId],
    );
    const currentStatus = String(requestRows[0]?.status ?? '');
    if (currentStatus !== 'searching') {
      this.logger.log(
        `[wave-processor] Wave ${params.waveIndex} cancelled for ${params.requestId}: status=${currentStatus}`,
      );
      return;
    }

    for (const worker of params.waveWorkers) {
      this.logger.log(
        `[wave-processor] Notifying worker ${worker.workerId} (${worker.distanceKm.toFixed(1)} km) [pos ${worker.queuePosition}] for request ${params.requestId}`,
      );
      this.realtimeGateway.emitToUser(worker.workerId, 'request.new', {
        requestId: params.requestId,
        category: params.category,
        title: params.title,
        budget: params.budget,
        distanceKm: worker.distanceKm,
        address: params.address,
        description: params.description,
        aiCategories: params.aiCategories,
        queuePosition: worker.queuePosition,
      });
    }

    const workerIds = params.waveWorkers.map((w) => w.workerId);
    const tokenRows = await this.dataSource.query<any[]>(
      `SELECT user_id, token FROM push_tokens WHERE user_id = ANY($1::uuid[])`,
      [workerIds],
    );
    const users = tokenRows.map((row) => ({
      userId: String(row.user_id),
      token: String(row.token),
    }));
    if (users.length === 0) {
      return;
    }

    const nearestDistance = Math.min(...params.waveWorkers.map((w) => w.distanceKm));
    await this.notificationsService.notifyWorkersForJobWave({
      users,
      jobId: params.requestId,
      category: params.category,
      offeredPrice: `Bs ${Math.round(params.budget)}`,
      distanceKm: nearestDistance.toFixed(1),
    });
  }

  private buildConnection() {
    const password = this.configService.get<string>('REDIS_PASSWORD');
    const useTls = this.configService.get<boolean>('REDIS_TLS', false);
    return {
      host: this.configService.getOrThrow<string>('REDIS_HOST'),
      port: this.configService.getOrThrow<number>('REDIS_PORT'),
      ...(password ? { password } : {}),
      db: this.configService.get<number>('REDIS_DB', 0),
      ...(useTls ? { tls: {} } : {}),
    };
  }
}
