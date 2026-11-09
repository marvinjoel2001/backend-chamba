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
      this.configService.get<string>('CLOUDINARY_CLOUD_NAME', '')?.trim() ||
      '';
    this.apiKey =
      this.configService.get<string>('CLOUDINARY_API_KEY', '')?.trim() ||
      '';
    this.apiSecret =
      this.configService.get<string>('CLOUDINARY_API_SECRET', '')?.trim() || '';
    this.enabled = Boolean(this.cloudName && this.apiKey && this.apiSecret);

    if (!this.enabled) {
      this.logger.warn(
        'Cloudinary disabled: missing CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET.',
      );
    }
  }

  /**
   * Solo en desarrollo y sin Cloudinary: guarda el archivo en disco
   * (`dev-uploads/`) y lo sirve el propio backend, para poder probar fotos y
   * videos en emuladores. En producción nunca se usa.
   */
  private get useDevDisk(): boolean {
    return (
      !this.enabled &&
      this.configService.get<string>('NODE_ENV') !== 'production'
    );
  }

  private async saveToDevDisk(
    data: Buffer,
    extension: string,
  ): Promise<{ url: string; publicId: string }> {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const dir = join(process.cwd(), 'dev-uploads');
    await mkdir(dir, { recursive: true });
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
    await writeFile(join(dir, name), data);
    const base = (
      this.configService.get<string>('DEV_PUBLIC_BASE_URL') ||
      `http://10.0.2.2:${this.configService.get<string>('PORT') || 3000}`
    ).replace(/\/$/, '');
    return { url: `${base}/dev-uploads/${name}`, publicId: `dev/${name}` };
  }

  async uploadBase64Image(params: {
    base64Data: string;
    folder: string;
  }): Promise<{ url: string; publicId: string }> {
    if (this.useDevDisk) {
      const match = /^data:image\/([a-z0-9+.-]+);base64,(.+)$/i.exec(
        params.base64Data,
      );
      const ext = (match?.[1] ?? 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '');
      return this.saveToDevDisk(
        Buffer.from(match?.[2] ?? params.base64Data, 'base64'),
        ext,
      );
    }
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
        signal: AbortSignal.timeout(45000),
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

  /**
   * Sube un video corto (el lugar del trabajo) y devuelve también una
   * miniatura JPG que Cloudinary genera del primer segundo.
   */
  async uploadVideo(params: {
    buffer: Buffer;
    mimeType: string;
    folder: string;
  }): Promise<{ url: string; publicId: string; thumbnailUrl: string }> {
    if (this.useDevDisk) {
      const ext = params.mimeType.includes('quicktime') ? 'mov' : 'mp4';
      const saved = await this.saveToDevDisk(params.buffer, ext);
      return { ...saved, thumbnailUrl: '' };
    }
    this.ensureConfigured();

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.sign({
      folder: params.folder,
      timestamp: String(timestamp),
    });

    const formData = new FormData();
    formData.append(
      'file',
      new Blob([new Uint8Array(params.buffer)], { type: params.mimeType }),
      'video',
    );
    formData.append('folder', params.folder);
    formData.append('timestamp', String(timestamp));
    formData.append('api_key', this.apiKey);
    formData.append('signature', signature);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${this.cloudName}/video/upload`,
      {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(120000),
      },
    );

    const payload = (await response.json()) as {
      secure_url?: string;
      public_id?: string;
      error?: { message?: string };
    };

    if (!response.ok || !payload.secure_url || !payload.public_id) {
      throw new ServiceUnavailableException(
        payload.error?.message || 'Cloudinary video upload failed',
      );
    }

    return {
      url: payload.secure_url,
      publicId: payload.public_id,
      thumbnailUrl: payload.secure_url
        .replace('/video/upload/', '/video/upload/so_1,w_480,c_limit/')
        .replace(/\.[a-z0-9]+$/i, '.jpg'),
    };
  }

  async deleteVideo(publicId?: string | null): Promise<void> {
    if (!publicId || this.useDevDisk) return;
    this.ensureConfigured();
    const timestamp = Math.floor(Date.now() / 1000);
    const formData = new FormData();
    formData.append('public_id', publicId);
    formData.append('timestamp', String(timestamp));
    formData.append('api_key', this.apiKey);
    formData.append(
      'signature',
      this.sign({ public_id: publicId, timestamp: String(timestamp) }),
    );
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${this.cloudName}/video/destroy`,
      { method: 'POST', body: formData },
    );
    if (!response.ok) {
      this.logger.warn(`Cloudinary video delete failed: ${await response.text()}`);
    }
  }

  /**
   * true si la URL es una imagen de la cuenta de Cloudinary de Chamba
   * (https://res.cloudinary.com/<cloud>/image/upload/...). Una foto de
   * cualquier otro sitio no se acepta.
   */
  isOwnImageUrl(value?: string | null): boolean {
    if (!value || !this.cloudName) return false;
    try {
      const url = new URL(value.trim());
      return (
        url.protocol === 'https:' &&
        url.hostname === 'res.cloudinary.com' &&
        !url.username &&
        !url.password &&
        url.pathname.startsWith(`/${this.cloudName}/image/upload/`)
      );
    } catch {
      return false;
    }
  }

  async deleteImage(publicId?: string | null): Promise<void> {
    if (!publicId) {
      return;
    }
    if (this.useDevDisk) return;

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
      .filter(
        ([, value]) => value !== undefined && value !== null && value !== '',
      )
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    return createHash('sha1')
      .update(`${toSign}${this.apiSecret}`)
      .digest('hex');
  }
}
