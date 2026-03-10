import { createHash } from 'node:crypto';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly cloudName: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.cloudName =
      this.configService.get<string>('CLOUDINARY_CLOUD_NAME', '')?.trim() || '';
    this.apiKey =
      this.configService.get<string>('CLOUDINARY_API_KEY', '')?.trim() || '';
    this.apiSecret =
      this.configService.get<string>('CLOUDINARY_API_SECRET', '')?.trim() || '';
    this.enabled = Boolean(this.cloudName && this.apiKey && this.apiSecret);

    if (!this.enabled) {
      this.logger.warn(
        'Cloudinary disabled: missing CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET.',
      );
    }
  }

  async uploadBase64Image(params: {
    base64Data: string;
    folder: string;
  }): Promise<{ url: string; publicId: string }> {
    this.ensureConfigured();

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.sign({
      folder: params.folder,
      timestamp: String(timestamp),
    });

    const formData = new FormData();
    formData.append('file', params.base64Data);
    formData.append('folder', params.folder);
    formData.append('timestamp', String(timestamp));
    formData.append('api_key', this.apiKey);
    formData.append('signature', signature);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`,
      {
        method: 'POST',
        body: formData,
      },
    );

    const payload = (await response.json()) as {
      secure_url?: string;
      public_id?: string;
      error?: { message?: string };
    };

    if (!response.ok || !payload.secure_url || !payload.public_id) {
      throw new ServiceUnavailableException(
        payload.error?.message || 'Cloudinary upload failed',
      );
    }

    return {
      url: payload.secure_url,
      publicId: payload.public_id,
    };
  }

  async deleteImage(publicId?: string | null): Promise<void> {
    if (!publicId) {
      return;
    }

    this.ensureConfigured();

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.sign({
      public_id: publicId,
      timestamp: String(timestamp),
    });

    const formData = new FormData();
    formData.append('public_id', publicId);
    formData.append('timestamp', String(timestamp));
    formData.append('api_key', this.apiKey);
    formData.append('signature', signature);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${this.cloudName}/image/destroy`,
      {
        method: 'POST',
        body: formData,
      },
    );

    if (!response.ok) {
      const text = await response.text();
      this.logger.warn(`Cloudinary delete failed: ${text}`);
    }
  }

  private ensureConfigured(): void {
    if (this.enabled) {
      return;
    }

    throw new ServiceUnavailableException(
      'Cloudinary is not configured in environment variables.',
    );
  }

  private sign(params: Record<string, string>): string {
    const toSign = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    return createHash('sha1')
      .update(`${toSign}${this.apiSecret}`)
      .digest('hex');
  }
}
