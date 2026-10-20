import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, Matches } from 'class-validator';

export class LinkWorkerDto {
  @ApiProperty({
    example: 'trabajador@gmail.com',
    description: 'Email de un trabajador ya registrado en la app móvil',
  })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    example: '482913',
    description:
      'Código que el trabajador recibió por notificación. Sin él, se le envía uno nuevo.',
  })
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'El código tiene 6 dígitos' })
  code?: string;
}
