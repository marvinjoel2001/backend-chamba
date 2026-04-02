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
                dbTime: any;
            };
            postgis: {
                enabled: boolean;
                version: any;
            };
            redis: {
                connected: boolean;
            };
        };
    }>;
}
