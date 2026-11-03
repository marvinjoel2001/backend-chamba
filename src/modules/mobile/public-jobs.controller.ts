import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicJobsService } from './services/public-jobs.service';
import { WorkModalitiesService } from './services/work-modalities.service';

/** Datos públicos para la web y la app (sin sesión). */
@ApiTags('Web pública')
@Controller()
export class PublicJobsController {
  constructor(
    private readonly publicJobs: PublicJobsService,
    private readonly modalities: WorkModalitiesService,
  ) {}

  @Get('web/jobs')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({
    summary:
      'Trabajos abiertos (solo título corto, categoría, presupuesto, modalidad y fecha)',
  })
  jobs(@Query('limit') limit?: string) {
    return this.publicJobs.list(Number(limit) || 12);
  }

  /** Modalidades activas: la app y la web muestran solo estas. */
  @Get('mobile/work-modalities')
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'Modalidades de contratación activas' })
  workModalities() {
    return this.modalities.get();
  }
}
