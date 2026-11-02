import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class BotSettingsDto {
  @IsIn(['manual', 'latest_client']) centerMode: 'manual' | 'latest_client';
  @IsNumber() @Min(-85) @Max(85) latitude: number;
  @IsNumber() @Min(-180) @Max(180) longitude: number;
  @IsNumber() @Min(0.25) @Max(50) radiusKm: number;
  @IsInt() @Min(60) @Max(86400) intervalSeconds: number;
  @IsInt() @Min(5) @Max(600) stepSeconds: number;
  @IsInt() @Min(1) @Max(10) maxConcurrent: number;
  @IsInt() @Min(1) @Max(500) dailyLimit: number;
}

export class BotProfileDto {
  @IsOptional() @IsString() @Length(2, 60) name?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional()
  @IsIn(['Limpieza', 'Plomería', 'Electricidad', 'Pintura'])
  specialty?: string;
}

export class RunBotDto {
  @IsUUID() requestId: string;
}
