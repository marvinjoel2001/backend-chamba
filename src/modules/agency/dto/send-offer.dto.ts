import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

export class SendOfferDto {
  @ApiProperty({ format: 'uuid', description: 'Trabajador de la agencia que se postula' })
  @IsUUID()
  workerUserId: string;

  @ApiProperty({ example: 120.5 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ example: 'Nuestro trabajador tiene 5 años de experiencia.' })
  @IsOptional()
  @IsString()
  message?: string;
}
