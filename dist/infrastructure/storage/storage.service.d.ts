import { ConfigService } from '@nestjs/config';
export declare class StorageService {
    private readonly configService;
    private readonly logger;
    private readonly cloudName;
    private readonly apiKey;
    private readonly apiSecret;
    private readonly enabled;
    constructor(configService: ConfigService);
    uploadBase64Image(params: {
        base64Data: string;
        folder: string;
    }): Promise<{
        url: string;
        publicId: string;
    }>;
    deleteImage(publicId?: string | null): Promise<void>;
    private ensureConfigured;
    private sign;
}
