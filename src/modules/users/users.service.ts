import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ReviewWorkerVerificationDto } from './dto/review-worker-verification.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserType, VerificationStatus } from './entities/user.entity';

const USERS_ALL_CACHE_KEY = 'users:all';
const USER_CACHE_PREFIX = 'users:';
const USER_CACHE_TTL = 120;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly redisService: RedisService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly notificationsService: NotificationsService,
    private readonly dataSource: DataSource,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const existingEmail = await this.usersRepository.findOne({
      where: { email: createUserDto.email },
    });

    if (existingEmail) {
      throw new ConflictException('A user with this email already exists');
    }

    if (createUserDto.phone) {
      const existingPhone = await this.usersRepository.findOne({
        where: { phone: createUserDto.phone },
      });

      if (existingPhone) {
        throw new ConflictException('A user with this phone already exists');
      }
    }

    const user = this.usersRepository.create(createUserDto);
    const saved = await this.usersRepository.save(user);

    await this.redisService.del(USERS_ALL_CACHE_KEY);
    this.realtimeGateway.broadcastUserCreated(saved);

    return saved;
  }

  async findAll(): Promise<User[]> {
    const cachedUsers =
      await this.redisService.get<User[]>(USERS_ALL_CACHE_KEY);

    if (cachedUsers) {
      return cachedUsers;
    }

    const users = await this.usersRepository.find({
      order: { createdAt: 'DESC' },
    });

    await this.redisService.set(USERS_ALL_CACHE_KEY, users, USER_CACHE_TTL);
    return users;
  }

  async findOne(id: string): Promise<User> {
    const cacheKey = `${USER_CACHE_PREFIX}${id}`;
    const cachedUser = await this.redisService.get<User>(cacheKey);

    if (cachedUser) {
      return cachedUser;
    }

    const user = await this.usersRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.redisService.set(cacheKey, user, USER_CACHE_TTL);
    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    if (
      updateUserDto.password !== undefined &&
      updateUserDto.password.trim().length < 4
    ) {
      throw new BadRequestException('password must be at least 4 characters');
    }

    if (updateUserDto.phone && updateUserDto.phone !== user.phone) {
      const existingPhone = await this.usersRepository.findOne({
        where: { phone: updateUserDto.phone },
      });

      if (existingPhone) {
        throw new ConflictException('A user with this phone already exists');
      }
    }

    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingEmail = await this.usersRepository.findOne({
        where: { email: updateUserDto.email },
      });

      if (existingEmail && existingEmail.id !== id) {
        throw new ConflictException('A user with this email already exists');
      }
    }

    // La contraseña no vive en la tabla users (entidad), se guarda en auth_credentials.
    const { password, ...userFields } = updateUserDto;

    const merged = this.usersRepository.merge(user, userFields);
    const updated = await this.usersRepository.save(merged);

    if (password) {
      await this.dataSource.query(
        `
        INSERT INTO auth_credentials (user_id, password)
        VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE SET password = EXCLUDED.password
        `,
        [id, password],
      );
    }

    await this.redisService.del(USERS_ALL_CACHE_KEY);
    await this.redisService.del(`${USER_CACHE_PREFIX}${id}`);

    return updated;
  }

  async getWorkerVerificationInbox(): Promise<User[]> {
    return this.usersRepository
      .createQueryBuilder('user')
      .where('user.type = :type', { type: UserType.WORKER })
      .andWhere('user.verificationStatus = :status', {
        status: VerificationStatus.PENDING,
      })
      .andWhere(
        '(user.idPhotoUrl IS NOT NULL OR user.facePhotoUrl IS NOT NULL)',
      )
      .orderBy('user.updatedAt', 'DESC')
      .getMany();
  }

  async reviewWorkerVerification(
    userId: string,
    review: ReviewWorkerVerificationDto,
  ): Promise<User> {
    if (
      review.idPhotoApproved === undefined &&
      review.facePhotoApproved === undefined
    ) {
      throw new BadRequestException(
        'At least one review decision is required (idPhotoApproved or facePhotoApproved)',
      );
    }

    const user = await this.findOne(userId);
    if (user.type !== UserType.WORKER) {
      throw new BadRequestException('Only workers can be reviewed');
    }

    if (!user.idPhotoUrl && !user.facePhotoUrl) {
      throw new BadRequestException(
        'Worker has no verification photos uploaded',
      );
    }

    const idPhotoVerified =
      review.idPhotoApproved !== undefined
        ? review.idPhotoApproved
        : (user.idPhotoVerified ?? null);
    const facePhotoVerified =
      review.facePhotoApproved !== undefined
        ? review.facePhotoApproved
        : (user.facePhotoVerified ?? null);
    const verificationStatus = this.resolveVerificationStatus(
      idPhotoVerified,
      facePhotoVerified,
    );

    const merged = this.usersRepository.merge(user, {
      idPhotoVerified,
      facePhotoVerified,
      verificationStatus,
      verificationReviewedAt: new Date(),
    });
    const updated = await this.usersRepository.save(merged);

    await this.redisService.del(USERS_ALL_CACHE_KEY);
    await this.redisService.del(`${USER_CACHE_PREFIX}${userId}`);

    this.emitVerificationUpdate(updated);

    // Push notification al worker
    const message = this.buildVerificationMessage(updated);
    const newVerificationStatus = updated.verificationStatus as string;
    if (
      newVerificationStatus === 'verified' ||
      newVerificationStatus === 'not_verified'
    ) {
      const tokenRows = await this.dataSource.query<any[]>(
        `SELECT token AS push_token FROM push_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1`,
        [userId],
      );
      this.notificationsService
        .notifyVerificationUpdated({
          userId,
          token: tokenRows[0]?.push_token || null,
          status:
            newVerificationStatus === 'verified' ? 'verified' : 'rejected',
          message,
        })
        .catch((e) =>
          this.logger.error('Failed to notify verification update', e),
        );
    }

    return updated;
  }

  async findNearbyWorkers(params: {
    latitude: number;
    longitude: number;
    radiusKm: number;
  }): Promise<User[]> {
    const { latitude, longitude, radiusKm } = params;

    if (radiusKm <= 0) {
      throw new BadRequestException('radiusKm must be greater than 0');
    }

    return this.usersRepository
      .createQueryBuilder('user')
      .where('user.type = :type', { type: UserType.WORKER })
      .andWhere('user.is_available = true')
      .andWhere('user.current_location IS NOT NULL')
      .andWhere(
        `ST_DWithin(
          user.current_location,
          ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography,
          :radiusMeters
        )`,
        {
          latitude,
          longitude,
          radiusMeters: radiusKm * 1000,
        },
      )
      .orderBy(
        `ST_Distance(
          user.current_location,
          ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography
        )`,
        'ASC',
      )
      .setParameters({ latitude, longitude })
      .getMany();
  }

  async uploadVerificationPhotos(
    userId: string,
    idPhoto: any, // any en lugar de Express.Multer.File
    facePhotoUrl?: string,
  ): Promise<User> {
    const user = await this.findOne(userId);

    // TODO: Implementar subida a Cloudinary aquí
    // Por ahora, simulamos URLs
    const idPhotoUrl = `https://res.cloudinary.com/demo/image/upload/${idPhoto.originalname}`;

    const updateData: Partial<User> = {
      idPhotoUrl,
      facePhotoUrl: facePhotoUrl || idPhotoUrl, // Temporalmente usamos la misma si no se proporciona
      verificationStatus: VerificationStatus.PENDING, // Usar el enum correctamente
      idPhotoVerified: null,
      facePhotoVerified: null,
      verificationReviewedAt: null,
    };

    const merged = this.usersRepository.merge(user, updateData);
    const updated = await this.usersRepository.save(merged);

    await this.redisService.del(USERS_ALL_CACHE_KEY);
    await this.redisService.del(`${USER_CACHE_PREFIX}${userId}`);

    this.emitVerificationUpdate(updated);

    return updated;
  }

  private resolveVerificationStatus(
    idPhotoVerified: boolean | null | undefined,
    facePhotoVerified: boolean | null | undefined,
  ): VerificationStatus {
    if (idPhotoVerified === true && facePhotoVerified === true) {
      return VerificationStatus.VERIFIED;
    }

    if (idPhotoVerified === false || facePhotoVerified === false) {
      return VerificationStatus.NOT_VERIFIED;
    }

    return VerificationStatus.PENDING;
  }

  private emitVerificationUpdate(user: User): void {
    const message = this.buildVerificationMessage(user);
    this.realtimeGateway.emitToUser(user.id, 'user.verification.updated', {
      verificationStatus: user.verificationStatus,
      idPhotoVerified: user.idPhotoVerified ?? null,
      facePhotoVerified: user.facePhotoVerified ?? null,
      reviewedAt: user.verificationReviewedAt?.toISOString() ?? null,
      message,
    });
  }

  private buildVerificationMessage(user: User): string {
    if (user.verificationStatus === VerificationStatus.VERIFIED) {
      return 'Tu perfil fue verificado. Ya puedes recibir trabajos. Bien hecho.';
    }

    if (user.verificationStatus === VerificationStatus.PENDING) {
      return 'Recibimos tus fotos. Nuestro equipo las esta revisando.';
    }

    if (user.idPhotoVerified === false && user.facePhotoVerified !== false) {
      return 'Revisamos tus fotos: tu carnet necesita una nueva imagen para continuar.';
    }

    if (user.facePhotoVerified === false && user.idPhotoVerified !== false) {
      return 'Revisamos tus fotos: tu selfie necesita una nueva imagen para continuar.';
    }

    return 'Necesitamos que vuelvas a subir tus fotos para completar tu verificacion.';
  }

  async softDelete(id: string) {
    const user = await this.findOne(id);
    user.isAvailable = false;
    await this.usersRepository.save(user);
    await this.redisService.del(USERS_ALL_CACHE_KEY);
    await this.redisService.del(USER_CACHE_PREFIX + id);
    return { deleted: true, id: user.id };
  }
}
