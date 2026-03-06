import { ConfigService } from '@nestjs/config';
export declare class StorageService {
    private readonly configService;
    private readonly bucketName;
    private readonly publicUrl?;
    private readonly client;
    constructor(configService: ConfigService);
    uploadBuffer(params: {
        key: string;
        body: Buffer;
        contentType: string;
    }): Promise<void>;
    getPublicFileUrl(key: string): string | null;
}
