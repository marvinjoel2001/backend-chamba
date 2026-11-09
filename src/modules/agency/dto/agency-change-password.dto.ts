import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AgencyChangePasswordDto {
  @ApiProperty({ example: 'secretoActual' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ example: 'nuevoSecreto123', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
