import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class AgencyLoginDto {
  @ApiProperty({ example: 'contacto@cleanpro.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'secreto123' })
  @IsString()
  @MinLength(6)
  password: string;
}
