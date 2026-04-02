import { DataSource } from 'typeorm';
import { RedisService } from '../../infrastructure/redis/redis.service';
export declare class HealthService {
    private readonly dataSource;
    private readonly redisService;
    constructor(dataSource: DataSource, redisService: RedisService);
    check(): Promise<{
        status: string;
        timestamp: string;
        dependencies: {
            postgres: {
                connected: boolean;
                dbTime: string;
            };
            postgis: {
                enabled: boolean;
                version: string;
            };
            redis: {
                connected: boolean;
            };
        };
    }>;
}
