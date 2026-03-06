import { UserType } from '../entities/user.entity';
export declare class UpdateUserDto {
    type?: UserType;
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    profilePhotoUrl?: string;
}
