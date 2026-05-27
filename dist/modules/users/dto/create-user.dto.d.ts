import { UserType } from '../entities/user.entity';
export declare class CreateUserDto {
    type?: UserType;
    email: string;
    phone?: string;
    countryCode?: string;
    ciNumber?: string;
    firstName: string;
    lastName?: string;
}
