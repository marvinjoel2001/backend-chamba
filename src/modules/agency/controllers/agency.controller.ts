import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AgencyService } from '../services/agency.service';
import { AgencyJwtAuthGuard } from '../guards/agency-jwt-auth.guard';
import { CurrentAgency } from '../decorators/current-agency.decorator';
import type { AgencyPrincipal } from '../strategies/agency-jwt.strategy';
import { LinkWorkerDto } from '../dto/link-worker.dto';
import { SendOfferDto } from '../dto/send-offer.dto';

@ApiTags('agency')
@ApiBearerAuth()
@UseGuards(AgencyJwtAuthGuard)
@Controller('agency')
export class AgencyController {
  constructor(private readonly agencyService: AgencyService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Estadísticas y actividad reciente de la agencia' })
  getDashboard(@CurrentAgency() agency: AgencyPrincipal) {
    return this.agencyService.getDashboard(agency.agencyId);
  }

  @Get('workers')
  @ApiOperation({ summary: 'Trabajadores vinculados a la agencia' })
  @ApiQuery({ name: 'search', required: false })
  getWorkers(
    @CurrentAgency() agency: AgencyPrincipal,
    @Query('search') search?: string,
  ) {
    return this.agencyService.getWorkers(agency.agencyId, search);
  }

  @Post('workers/link')
  @ApiOperation({ summary: 'Vincular un trabajador existente por email' })
  linkWorker(
    @CurrentAgency() agency: AgencyPrincipal,
    @Body() dto: LinkWorkerDto,
  ) {
    return this.agencyService.linkWorker(agency.agencyId, dto.email);
  }

  @Delete('workers/:workerUserId')
  @ApiOperation({ summary: 'Desvincular un trabajador de la agencia' })
  unlinkWorker(
    @CurrentAgency() agency: AgencyPrincipal,
    @Param('workerUserId', ParseUUIDPipe) workerUserId: string,
  ) {
    return this.agencyService.unlinkWorker(agency.agencyId, workerUserId);
  }

  @Patch('workers/:workerUserId/block')
  @ApiOperation({ summary: 'Bloquear o desbloquear un trabajador de la agencia' })
  toggleWorkerBlock(
    @CurrentAgency() agency: AgencyPrincipal,
    @Param('workerUserId', ParseUUIDPipe) workerUserId: string,
  ) {
    return this.agencyService.toggleWorkerBlock(agency.agencyId, workerUserId);
  }

  @Get('jobs/assigned')
  @ApiOperation({
    summary: 'Trabajos ganados por la agencia (en curso e historial)',
  })
  getAssignedJobs(@CurrentAgency() agency: AgencyPrincipal) {
    return this.agencyService.getAssignedJobs(agency.agencyId);
  }

  @Get('jobs/active')
  @ApiOperation({ summary: 'Solicitudes de trabajo activas para el mapa' })
  @ApiQuery({ name: 'lat', required: false })
  @ApiQuery({ name: 'lng', required: false })
  @ApiQuery({ name: 'radiusKm', required: false })
  getActiveJobs(
    @CurrentAgency() agency: AgencyPrincipal,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radiusKm') radiusKm?: string,
  ) {
    return this.agencyService.getActiveJobs(agency.agencyId, {
      lat: lat != null && lat !== '' ? Number(lat) : undefined,
      lng: lng != null && lng !== '' ? Number(lng) : undefined,
      radiusKm:
        radiusKm != null && radiusKm !== '' ? Number(radiusKm) : undefined,
    });
  }

  @Post('jobs/:requestId/offer')
  @ApiOperation({
    summary: 'Enviar una oferta en nombre de un trabajador de la agencia',
  })
  sendOffer(
    @CurrentAgency() agency: AgencyPrincipal,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: SendOfferDto,
  ) {
    return this.agencyService.sendOffer(agency.agencyId, requestId, dto);
  }
}
