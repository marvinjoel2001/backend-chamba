import { RedisService } from '../../infrastructure/redis/redis.service';
export declare class QueuesService {
    private readonly redisService;
    constructor(redisService: RedisService);
    enqueue(queueName: string, payload: Record<string, unknown>): Promise<void>;
    dequeue<T>(queueName: string): Promise<T | null>;
}
