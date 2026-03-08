import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendTestPushDto {
  @ApiProperty({ example: 'fcm-device-token' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiPropertyOptional({ example: 'Chamba' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Notificación de prueba desde backend' })
  @IsOptional()
  @IsString()
  body?: string;
}
