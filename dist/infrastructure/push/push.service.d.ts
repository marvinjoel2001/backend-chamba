import { ConfigService } from '@nestjs/config';
export declare class PushService {
    private readonly configService;
    private readonly logger;
    private readonly app;
    private readonly messaging;
    constructor(configService: ConfigService);
    isEnabled(): boolean;
    sendToToken(params: {
        token: string;
        title: string;
        body: string;
        data?: Record<string, string>;
    }): Promise<string | null>;
    sendToTokens(params: {
        tokens: string[];
        title: string;
        body: string;
        data?: Record<string, string>;
    }): Promise<number>;
    private normalizePrivateKey;
}
