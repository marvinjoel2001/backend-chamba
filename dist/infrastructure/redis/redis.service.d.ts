import type { RedisClient } from './redis.types';
export declare class RedisService {
    private readonly redisClient;
    constructor(redisClient: RedisClient);
    get client(): RedisClient;
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: unknown, ttlInSeconds?: number): Promise<void>;
    del(key: string): Promise<void>;
}
