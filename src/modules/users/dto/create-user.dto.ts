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

  @ApiPropertyOptional({ example: '+59170000000' })
  @IsOptional()
  @Matches(/^[+0-9\\s-]{7,20}$/)
  phone?: string;

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
