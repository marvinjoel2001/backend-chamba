import { HealthService } from './health.service';
export declare class HealthController {
    private readonly healthService;
    constructor(healthService: HealthService);
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
