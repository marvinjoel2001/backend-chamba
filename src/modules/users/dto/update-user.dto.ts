import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { UserType } from '../entities/user.entity';

export class UpdateUserDto {
  @IsOptional()
  @IsEnum(UserType)
  type?: UserType;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @Matches(/^[+0-9\\s-]{7,20}$/)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @IsOptional()
  @IsString()
  profilePhotoUrl?: string;
}
