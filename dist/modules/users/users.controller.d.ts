import { CreateUserDto } from './dto/create-user.dto';
import { ReviewWorkerVerificationDto } from './dto/review-worker-verification.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    create(createUserDto: CreateUserDto): Promise<User>;
    findAll(): Promise<User[]>;
    findNearbyWorkers(latitude: number, longitude: number, radiusKm?: number): Promise<User[]>;
    getWorkerVerificationInbox(): Promise<User[]>;
    reviewWorkerVerification(id: string, body: ReviewWorkerVerificationDto): Promise<User>;
    findOne(id: string): Promise<User>;
    update(id: string, updateUserDto: UpdateUserDto): Promise<User>;
    uploadVerificationPhotos(id: string, idPhoto: any, body: {
        facePhotoUrl?: string;
    }): Promise<User>;
    remove(id: string): Promise<{
        deleted: boolean;
        id: string;
    }>;
}
