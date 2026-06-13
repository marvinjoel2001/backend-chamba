import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

export const WAVE_QUEUE_NAME = 'worker-notification-waves';

export interface WaveJobData {
  requestId: string;
  category: string;
  title: string;
  budget: number;
  address: string;
  description: string;
  aiCategories: Array<{ id: string; name: string; confidence: number }>;
  waveWorkers: Array<{
    workerId: string;
    distanceKm: number;
    queuePosition: number;
  }>;
  waveIndex: number;
}

@Injectable()
export class WaveDispatchQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WaveDispatchQueueService.name);
  private queue: Queue<WaveJobData> | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    if (this.configService.get('USE_QUEUE_DISPATCH') !== 'true') {
      return;
    }
    this.queue = new Queue<WaveJobData>(WAVE_QUEUE_NAME, {
      connection: this.buildConnection(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });
    this.logger.log(`BullMQ queue "${WAVE_QUEUE_NAME}" ready`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }

  async enqueueWave(data: WaveJobData, delayMs: number): Promise<void> {
    if (!this.queue) {
      throw new Error('WaveDispatchQueue not initialized: USE_QUEUE_DISPATCH must be "true"');
    }
    const jobId = `wave-${data.requestId}-${data.waveIndex}`;
    await this.queue.add('dispatch-wave', data, { jobId, delay: delayMs });
    this.logger.log(
      `Enqueued wave ${data.waveIndex} for request ${data.requestId} (delay=${delayMs}ms)`,
    );
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
