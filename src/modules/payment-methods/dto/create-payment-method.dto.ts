import { IsString, IsOptional, IsBoolean, IsInt, IsJSON } from 'class-validator';

export class CreatePaymentMethodDto {
  @IsString()
  name: string;

  @IsString()
  code: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsInt()
  @IsOptional()
  sortOrder?: number;

  @IsOptional()
  config?: Record<string, any>;
}
