import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StorageService {
  private readonly bucketName: string;
  private readonly publicUrl?: string;
  private readonly client: S3Client;

  constructor(private readonly configService: ConfigService) {
    const accountId = this.configService.getOrThrow<string>('R2_ACCOUNT_ID');
    const region = this.configService.get<string>('R2_REGION', 'auto');

    this.bucketName = this.configService.getOrThrow<string>('R2_BUCKET');
    this.publicUrl = this.configService.get<string>('R2_PUBLIC_URL');

    this.client = new S3Client({
      region,
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('R2_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow<string>(
          'R2_SECRET_ACCESS_KEY',
        ),
      },
    });
  }

  async uploadBuffer(params: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    });

    await this.client.send(command);
  }

  getPublicFileUrl(key: string): string | null {
    if (!this.publicUrl) {
      return null;
    }

    return `${this.publicUrl.replace(/\/$/, '')}/${key}`;
  }
}
