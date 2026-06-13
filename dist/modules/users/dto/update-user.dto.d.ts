import { CreateUserDto } from './create-user.dto';
import { VerificationStatus } from '../entities/user.entity';
declare const UpdateUserDto_base: import("@nestjs/common").Type<Partial<CreateUserDto>>;
export declare class UpdateUserDto extends UpdateUserDto_base {
    password?: string;
    isAvailable?: boolean;
    isBlocked?: boolean;
    profilePhotoUrl?: string;
    verificationStatus?: VerificationStatus;
    idPhotoUrl?: string;
    facePhotoUrl?: string;
    idPhotoVerified?: boolean | null;
    facePhotoVerified?: boolean | null;
}
export {};
