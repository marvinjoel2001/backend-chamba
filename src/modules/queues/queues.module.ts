import { Module } from '@nestjs/common';
import { QueuesService } from './queues.service';
import { WaveDispatchQueueService } from './wave-dispatch.queue.service';

@Module({
  providers: [QueuesService, WaveDispatchQueueService],
  exports: [QueuesService, WaveDispatchQueueService],
})
export class QueuesModule {}
