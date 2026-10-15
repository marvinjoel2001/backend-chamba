import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateAgencyWorkerDto {
  @ApiProperty({ example: 'Jorge' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  firstName: string;

  @ApiPropertyOptional({ example: 'Peña' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string;

  @ApiProperty({ example: 'jorge@cleanpro.com', description: 'Usuario para entrar a la app' })
  @IsString()
  email: string;

  @ApiPropertyOptional({ example: '70000000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Si no se envía, se genera una' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ example: 20, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionRate?: number | null;
}

export class WorkerCommissionDto {
  @ApiProperty({ example: 15, nullable: true, description: 'null = usar la general' })
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionRate: number | null;
}

export class AgencySettingsDto {
  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  workerCommissionRate?: number;
}

export class AgencyMessageDto {
  @ApiProperty({ example: 'Reunión el lunes' })
  @IsString()
  @MaxLength(80)
  title: string;

  @ApiProperty({ example: 'Nos vemos a las 8 en la oficina.' })
  @IsString()
  @MaxLength(500)
  body: string;

  @ApiPropertyOptional({ description: '"all" o lista de ids', oneOf: [{ type: 'string' }, { type: 'array' }] })
  @IsOptional()
  @ValidateIf((_, v) => v !== 'all')
  @IsArray()
  @IsUUID('all', { each: true })
  workerIds?: string[] | 'all';
}

export class AgencyPayoutDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  workerId: string;

  @ApiProperty({ example: 150 })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ enum: ['paid', 'kept_cash'] })
  @IsOptional()
  @IsIn(['paid', 'kept_cash'])
  kind?: 'paid' | 'kept_cash';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  paidAt?: string;
}

export class AgencySettlementDto {
  @ApiProperty({ enum: ['to_agency', 'to_chamba'] })
  @IsIn(['to_agency', 'to_chamba'])
  direction: 'to_agency' | 'to_chamba';

  @ApiProperty({ example: 500 })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
