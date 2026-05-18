import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserType } from '../entities/user.entity';

export class CreateUserDto {
  @ApiPropertyOptional({ enum: UserType, example: UserType.CLIENT })
  @IsOptional()
  @IsEnum(UserType)
  type?: UserType;

  @ApiProperty({ example: 'usuario@chamba.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '70000000' })
  @IsOptional()
  @Matches(/^[0-9\\s-]{7,15}$/)
  phone?: string;

  @ApiPropertyOptional({ example: '+591' })
  @IsOptional()
  @Matches(/^[+][0-9]{1,4}$/)
  countryCode?: string;

  @ApiPropertyOptional({ example: '12345678' })
  @IsOptional()
  @Matches(/^[0-9]{5,15}$/)
  ciNumber?: string;

  @ApiProperty({ example: 'Juan' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName: string;

  @ApiPropertyOptional({ example: 'Pérez' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;
}
