import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { join } from 'node:path';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { createWorker } from 'tesseract.js';
import {
  CHAT_CONTACT_ALERT,
  containsExternalContact,
} from '../shared/job-chat-policy';

@Injectable()
export class JobChatPhotoService {
  private busy = false;

  async validate(base64: string): Promise<Buffer> {
    if (
      typeof base64 !== 'string' ||
      base64.length > 8 * 1024 * 1024 ||
      !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
        base64,
      )
    ) {
      throw new BadRequestException(
        'Selecciona una foto JPG, PNG o WebP de hasta 6 MB.',
      );
    }
    if (this.busy) {
      throw new ServiceUnavailableException(
        'Estamos revisando otra foto. Intenta nuevamente en unos segundos.',
      );
    }
    this.busy = true;
    let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
    try {
      const input = Buffer.from(
        base64.substring(base64.indexOf(',') + 1),
        'base64',
      );
      const metadata = await sharp(input, {
        limitInputPixels: 16_000_000,
      }).metadata();
      if (
        !['jpeg', 'png', 'webp'].includes(metadata.format ?? '') ||
        (metadata.pages ?? 1) > 1
      ) {
        throw new BadRequestException(
          'Solo se permiten fotos estáticas del trabajo.',
        );
      }
      // Re-encode to remove EXIF/contact metadata before OCR and storage.
      const image = await sharp(input, { limitInputPixels: 16_000_000 })
        .rotate()
        .resize({
          width: 1920,
          height: 1920,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();
      const { data, info } = await sharp(image)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      if (jsQR(new Uint8ClampedArray(data), info.width, info.height)) {
        throw new BadRequestException(CHAT_CONTACT_ALERT);
      }
      const languageRoot = join(
        require.resolve('@tesseract.js-data/spa/package.json'),
        '..',
        '4.0.0_best_int',
      );
      worker = await createWorker('spa', 1, {
        langPath: languageRoot,
        cacheMethod: 'none',
      });
      const { data: result } = await worker.recognize(image);
      if (containsExternalContact(result.text))
        throw new BadRequestException(CHAT_CONTACT_ALERT);
      return await sharp(image).jpeg({ quality: 85 }).toBuffer();
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ServiceUnavailableException
      )
        throw error;
      throw new ServiceUnavailableException(
        'No pudimos revisar la foto. Intenta con otra imagen.',
      );
    } finally {
      try {
        await worker?.terminate();
      } finally {
        this.busy = false;
      }
    }
  }
}
