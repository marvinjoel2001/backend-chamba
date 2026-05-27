import { Repository } from 'typeorm';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateUserDto } from './dto/create-user.dto';
import { ReviewWorkerVerificationDto } from './dto/review-worker-verification.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
export declare class UsersService {
    private readonly usersRepository;
    private readonly redisService;
    private readonly realtimeGateway;
    constructor(usersRepository: Repository<User>, redisService: RedisService, realtimeGateway: RealtimeGateway);
    create(createUserDto: CreateUserDto): Promise<User>;
    findAll(): Promise<User[]>;
    findOne(id: string): Promise<User>;
    update(id: string, updateUserDto: UpdateUserDto): Promise<User>;
    getWorkerVerificationInbox(): Promise<User[]>;
    reviewWorkerVerification(userId: string, review: ReviewWorkerVerificationDto): Promise<User>;
    findNearbyWorkers(params: {
        latitude: number;
        longitude: number;
        radiusKm: number;
    }): Promise<User[]>;
    uploadVerificationPhotos(userId: string, idPhoto: any, facePhotoUrl?: string): Promise<User>;
    private resolveVerificationStatus;
    private emitVerificationUpdate;
    private buildVerificationMessage;
    softDelete(id: string): Promise<{
        deleted: boolean;
        id: string;
    }>;
}
