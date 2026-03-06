import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { UserType } from '../entities/user.entity';

export class CreateUserDto {
  @IsOptional()
  @IsEnum(UserType)
  type?: UserType;

  @IsEmail()
  email: string;

  @IsOptional()
  @Matches(/^[+0-9\\s-]{7,20}$/)
  phone?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;
}
