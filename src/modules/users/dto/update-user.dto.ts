import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional({ example: 'https://cdn.chamba.com/profile.jpg' })
  @IsOptional()
  @IsString()
  profilePhotoUrl?: string;
}
