import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsBoolean } from 'class-validator';
import { CreateUserDto } from './create-user.dto';
import { VerificationStatus } from '../entities/user.entity';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isBlocked?: boolean;
  @ApiPropertyOptional({ example: 'https://cdn.chamba.com/profile.jpg' })
  @IsOptional()
  @IsString()
  profilePhotoUrl?: string;

  @ApiPropertyOptional({ enum: VerificationStatus, example: VerificationStatus.PENDING })
  @IsOptional()
  @IsEnum(VerificationStatus)
  verificationStatus?: VerificationStatus;

  @ApiPropertyOptional({ example: 'https://cdn.chamba.com/id-photo.jpg' })
  @IsOptional()
  @IsString()
  idPhotoUrl?: string;

  @ApiPropertyOptional({ example: 'https://cdn.chamba.com/face-photo.jpg' })
  @IsOptional()
  @IsString()
  facePhotoUrl?: string;

  @ApiPropertyOptional({ example: true, nullable: true })
  @IsOptional()
  @IsBoolean()
  idPhotoVerified?: boolean | null;

  @ApiPropertyOptional({ example: false, nullable: true })
  @IsOptional()
  @IsBoolean()
  facePhotoVerified?: boolean | null;
}
