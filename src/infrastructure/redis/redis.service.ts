import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT } from './redis.constants';
import type { RedisClient } from './redis.types';

@Injectable()
export class RedisService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: RedisClient,
  ) {}

  get client(): RedisClient {
    return this.redisClient;
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.redisClient.get(key);
    if (!value) {
      return null;
    }

    return JSON.parse(value) as T;
  }

  async set(key: string, value: unknown, ttlInSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);

    if (ttlInSeconds) {
      await this.redisClient.set(key, serialized, {
        EX: ttlInSeconds,
      });
      return;
    }

    await this.redisClient.set(key, serialized);
  }

  async del(key: string): Promise<void> {
    await this.redisClient.del(key);
  }
}
