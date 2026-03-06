import { OnModuleDestroy } from '@nestjs/common';
import type { RedisClient } from './redis.types';
export declare class RedisModule implements OnModuleDestroy {
    private readonly redisClient;
    constructor(redisClient: RedisClient);
    onModuleDestroy(): Promise<void>;
}
