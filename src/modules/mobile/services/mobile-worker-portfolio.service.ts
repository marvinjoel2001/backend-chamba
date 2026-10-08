import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import sharp from 'sharp';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import { AddPortfolioPhotoDto } from '../dto/add-portfolio-photo.dto';

@Injectable()
export class MobileWorkerPortfolioService {
  static readonly MAX_PHOTOS = 20;
  private readonly logger = new Logger(MobileWorkerPortfolioService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: StorageService,
  ) {}

  async list(workerId: string) {
    const workers = await this.dataSource.query(
      `SELECT id FROM users WHERE id = $1 AND type = 'worker'`,
      [workerId],
    );
    if (!workers.length)
      throw new NotFoundException('Trabajador no encontrado');
    const photos = await this.dataSource.query(
      `SELECT id, url, caption, created_at AS "createdAt"
       FROM worker_portfolio_photos WHERE worker_user_id = $1
       ORDER BY created_at DESC, id DESC`,
      [workerId],
    );
    return { photos, maxPhotos: MobileWorkerPortfolioService.MAX_PHOTOS };
  }

  async add(workerId: string, input: AddPortfolioPhotoDto) {
    const image = await this.prepareImage(input.imageBase64);
    const [worker] = await this.dataSource.query(
      `SELECT u.id, (SELECT COUNT(*)::int FROM worker_portfolio_photos
        WHERE worker_user_id = u.id) AS total
       FROM users u WHERE u.id = $1 AND u.type = 'worker'`,
      [workerId],
    );
    if (!worker) throw new NotFoundException('Trabajador no encontrado');
    if (worker.total >= MobileWorkerPortfolioService.MAX_PHOTOS) {
      throw new BadRequestException('Puedes publicar hasta 20 fotos de tus trabajos');
    }
    let uploadedId: string | undefined;
    try {
      // Upload before locking the worker row used by offer acceptance.
      const uploaded = await this.storage.uploadBase64Image({
        base64Data: `data:image/jpeg;base64,${image.toString('base64')}`,
        folder: `chamba/portfolio/${workerId}`,
      });
      uploadedId = uploaded.publicId;
      const photo = await this.dataSource.transaction(async (manager) => {
        // Serialize additions per worker so concurrent uploads respect the limit.
        const workers = await manager.query(
          `SELECT id FROM users WHERE id = $1 AND type = 'worker' FOR UPDATE`,
          [workerId],
        );
        if (!workers.length)
          throw new NotFoundException('Trabajador no encontrado');
        const [row] = await manager.query(
          `SELECT COUNT(*)::int AS total FROM worker_portfolio_photos
           WHERE worker_user_id = $1`,
          [workerId],
        );
        if (row.total >= MobileWorkerPortfolioService.MAX_PHOTOS) {
          throw new BadRequestException(
            'Puedes publicar hasta 20 fotos de tus trabajos',
          );
        }
        const [saved] = await manager.query(
          `INSERT INTO worker_portfolio_photos (worker_user_id, url, public_id, caption)
           VALUES ($1, $2, $3, $4)
           RETURNING id, url, caption, created_at AS "createdAt"`,
          [
            workerId,
            uploaded.url,
            uploaded.publicId,
            input.caption?.trim() ?? '',
          ],
        );
        return saved;
      });
      return { photo };
    } catch (error) {
      if (uploadedId) await this.cleanup(uploadedId);
      throw error;
    }
  }

  async remove(workerId: string, photoId: string) {
    const rows = await this.dataSource.query(
      `WITH removed AS (
         DELETE FROM worker_portfolio_photos WHERE id = $1 AND worker_user_id = $2
         RETURNING public_id
       ) SELECT public_id FROM removed`,
      [photoId, workerId],
    );
    if (!rows.length) throw new NotFoundException('Foto no encontrada');
    await this.cleanup(rows[0].public_id);
    return { deleted: true };
  }

  private async cleanup(publicId: string) {
    try {
      await this.storage.deleteImage(publicId);
    } catch {
      this.logger.warn('No se pudo eliminar una imagen del almacenamiento');
    }
  }

  private async prepareImage(value: string): Promise<Buffer> {
    if (
      typeof value !== 'string' ||
      value.length > 7 * 1024 * 1024 ||
      !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
    ) {
      throw new BadRequestException(
        'Selecciona una foto JPG, PNG o WebP de hasta 5 MB',
      );
    }
    const bytes = Buffer.from(
      value.substring(value.indexOf(',') + 1),
      'base64',
    );
    if (bytes.length > 5 * 1024 * 1024) {
      throw new BadRequestException('La foto supera los 5 MB');
    }
    try {
      const metadata = await sharp(bytes, {
        limitInputPixels: 20_000_000,
      }).metadata();
      if (
        !['jpeg', 'png', 'webp'].includes(metadata.format ?? '') ||
        (metadata.pages ?? 1) > 1
      ) {
        throw new Error('Unsupported image');
      }
      return await sharp(bytes, { limitInputPixels: 20_000_000 })
        .rotate()
        .resize({
          width: 1920,
          height: 1920,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch {
      throw new BadRequestException(
        'No pudimos leer la foto. Selecciona otra imagen',
      );
    }
  }
}
