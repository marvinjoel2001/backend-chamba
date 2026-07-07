import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AgencyChangePasswordDto {
  @ApiProperty({ example: 'secretoActual' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ example: 'nuevoSecreto123', minLength: 6 })
  @IsString()
  @MinLength(6)
  newPassword: string;
}
