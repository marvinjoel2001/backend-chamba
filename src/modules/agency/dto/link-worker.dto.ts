import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class LinkWorkerDto {
  @ApiProperty({
    example: 'trabajador@gmail.com',
    description: 'Email de un trabajador ya registrado en la app móvil',
  })
  @IsEmail()
  email: string;
}
