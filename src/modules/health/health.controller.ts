import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { HealthService } from './health.service';

class HealthDependencyStatusDto {
  @ApiProperty({ example: true })
  connected: boolean;

  @ApiProperty({ example: '2026-03-08T22:42:26.170Z', required: false })
  dbTime?: string;

  @ApiProperty({
    example: '3.5 USE_GEOS=1 USE_PROJ=1 USE_STATS=1',
    required: false,
  })
  version?: string;
}

class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status: string;

  @ApiProperty({ example: '2026-03-08T22:42:26.254Z' })
  timestamp: string;

  @ApiProperty({
    type: Object,
    example: {
      postgres: {
        connected: true,
        dbTime: '2026-03-08T22:42:26.170Z',
      },
      postgis: {
        enabled: true,
        version: '3.5 USE_GEOS=1 USE_PROJ=1 USE_STATS=1',
      },
      redis: {
        connected: true,
      },
    },
  })
  dependencies: {
    postgres: HealthDependencyStatusDto;
    postgis: { enabled: boolean; version: string };
    redis: HealthDependencyStatusDto;
  };
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @ApiOperation({ summary: 'Verificar estado del backend y dependencias' })
  @ApiOkResponse({ type: HealthResponseDto })
  @Get()
  check() {
    return this.healthService.check();
  }
}
