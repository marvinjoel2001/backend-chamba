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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AgencyService } from '../services/agency.service';
import { AgencyJwtAuthGuard } from '../guards/agency-jwt-auth.guard';
import { CurrentAgency } from '../decorators/current-agency.decorator';
import type { AgencyPrincipal } from '../strategies/agency-jwt.strategy';
import { LinkWorkerDto } from '../dto/link-worker.dto';
import { SendOfferDto } from '../dto/send-offer.dto';
import { AgencyOperationsService } from '../services/agency-operations.service';
import {
  AgencyMessageDto,
  AgencyPayoutDto,
  AgencySettingsDto,
  CreateAgencyWorkerDto,
  WorkerCommissionDto,
} from '../dto/agency-operations.dto';

@ApiTags('agency')
@ApiBearerAuth()
@UseGuards(AgencyJwtAuthGuard)
@Controller('agency')
export class AgencyController {
  constructor(
    private readonly agencyService: AgencyService,
    private readonly operations: AgencyOperationsService,
  ) {}

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
  @ApiOperation({
    summary: 'Bloquear o desbloquear un trabajador de la agencia',
  })
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

  @Get('reports')
  @ApiOperation({
    summary: 'Reportes financieros y rendimiento de trabajadores de la agencia',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['month', 'last_month', 'quarter', 'year', 'all'],
  })
  @ApiQuery({ name: 'workerId', required: false })
  getReports(
    @CurrentAgency() agency: AgencyPrincipal,
    @Query('period') period?: string,
    @Query('workerId') workerId?: string,
  ) {
    return this.agencyService.getReports(agency.agencyId, { period, workerId });
  }

  // ── Ajustes ──

  @Get('settings')
  @ApiOperation({ summary: 'Datos y comisiones de la agencia' })
  getSettings(@CurrentAgency() agency: AgencyPrincipal) {
    return this.operations.getSettings(agency.agencyId);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Cambiar la comisión general que cobra a sus trabajadores' })
  updateSettings(@CurrentAgency() agency: AgencyPrincipal, @Body() dto: AgencySettingsDto) {
    return this.operations.updateSettings(agency.agencyId, dto);
  }

  // ── Flota ──

  @Post('workers')
  @ApiOperation({ summary: 'Crear la cuenta de un trabajador de la agencia' })
  createWorker(@CurrentAgency() agency: AgencyPrincipal, @Body() dto: CreateAgencyWorkerDto) {
    return this.operations.createWorker(agency.agencyId, dto);
  }

  @Post('workers/:workerUserId/password')
  @ApiOperation({ summary: 'Generar una contraseña nueva (se muestra una vez)' })
  resetWorkerPassword(
    @CurrentAgency() agency: AgencyPrincipal,
    @Param('workerUserId', ParseUUIDPipe) workerUserId: string,
  ) {
    return this.operations.resetWorkerPassword(agency.agencyId, workerUserId);
  }

  @Patch('workers/:workerUserId/commission')
  @ApiOperation({ summary: 'Comisión propia de un trabajador (null = la general)' })
  setWorkerCommission(
    @CurrentAgency() agency: AgencyPrincipal,
    @Param('workerUserId', ParseUUIDPipe) workerUserId: string,
    @Body() dto: WorkerCommissionDto,
  ) {
    return this.operations.setWorkerCommission(agency.agencyId, workerUserId, dto.commissionRate);
  }

  // ── Avisos ──

  @Get('messages')
  @ApiOperation({ summary: 'Avisos enviados a los trabajadores' })
  listMessages(@CurrentAgency() agency: AgencyPrincipal) {
    return this.operations.listMessages(agency.agencyId);
  }

  @Post('messages')
  @ApiOperation({ summary: 'Enviar un aviso con push a uno, varios o todos' })
  sendMessage(@CurrentAgency() agency: AgencyPrincipal, @Body() dto: AgencyMessageDto) {
    return this.operations.sendMessage(agency.agencyId, dto);
  }

  // ── Pagos ──

  @Get('payouts')
  @ApiOperation({ summary: 'Saldo y pagos de cada trabajador' })
  getPayouts(@CurrentAgency() agency: AgencyPrincipal) {
    return this.operations.getPayouts(agency.agencyId);
  }

  @Post('payouts')
  @ApiOperation({ summary: 'Registrar un pago a un trabajador' })
  createPayout(@CurrentAgency() agency: AgencyPrincipal, @Body() dto: AgencyPayoutDto) {
    return this.operations.createPayout(agency.agencyId, dto);
  }

  @Delete('payouts/:payoutId')
  @ApiOperation({ summary: 'Borrar un pago registrado por error' })
  deletePayout(
    @CurrentAgency() agency: AgencyPrincipal,
    @Param('payoutId', ParseUUIDPipe) payoutId: string,
  ) {
    return this.operations.deletePayout(agency.agencyId, payoutId);
  }

  @Get('chamba-account')
  @ApiOperation({ summary: 'Cuenta con Chamba: pagos digitales, comisiones y liquidaciones' })
  getChambaAccount(@CurrentAgency() agency: AgencyPrincipal) {
    return this.operations.getChambaAccount(agency.agencyId);
  }

  @Get('disputes')
  @ApiOperation({
    summary: 'Listar disputas y reportes que involucran a trabajadores de la agencia',
  })
  getDisputes(@CurrentAgency() agency: AgencyPrincipal) {
    return this.agencyService.getDisputes(agency.agencyId);
  }
}

