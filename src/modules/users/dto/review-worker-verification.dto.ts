import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class ReviewWorkerVerificationDto {
  @ApiPropertyOptional({
    description: 'Aprobacion/rechazo de la foto del carnet',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  idPhotoApproved?: boolean;

  @ApiPropertyOptional({
    description: 'Aprobacion/rechazo de la selfie del trabajador',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  facePhotoApproved?: boolean;
}
