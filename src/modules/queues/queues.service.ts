import { Injectable } from '@nestjs/common';
import { RedisService } from '../../infrastructure/redis/redis.service';

@Injectable()
export class QueuesService {
  constructor(private readonly redisService: RedisService) {}

  async enqueue(
    queueName: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.redisService.client.lPush(queueName, JSON.stringify(payload));
  }

  async dequeue<T>(queueName: string): Promise<T | null> {
    const raw = await this.redisService.client.rPop(queueName);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as T;
  }
}
