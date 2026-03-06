import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserType } from './entities/user.entity';

const USERS_ALL_CACHE_KEY = 'users:all';
const USER_CACHE_PREFIX = 'users:';
const USER_CACHE_TTL = 120;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly redisService: RedisService,
    private readonly realtimeGateway: RealtimeGateway,
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

    if (updateUserDto.phone && updateUserDto.phone !== user.phone) {
      const existingPhone = await this.usersRepository.findOne({
        where: { phone: updateUserDto.phone },
      });

      if (existingPhone) {
        throw new ConflictException('A user with this phone already exists');
      }
    }

    const merged = this.usersRepository.merge(user, updateUserDto);
    const updated = await this.usersRepository.save(merged);

    await this.redisService.del(USERS_ALL_CACHE_KEY);
    await this.redisService.del(`${USER_CACHE_PREFIX}${id}`);

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
}
