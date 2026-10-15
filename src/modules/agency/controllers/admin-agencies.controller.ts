import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminAgenciesService } from '../services/admin-agencies.service';
import { CreateAgencyDto, UpdateAgencyDto } from '../dto/create-agency.dto';
import { AgencySettlementDto } from '../dto/agency-operations.dto';
import { AgencyOperationsService } from '../services/agency-operations.service';

// CRUD de agencias para el panel admin (usa el JWT de admin_users,
// no el de agencias).
@ApiTags('admin-agencies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/agencies')
export class AdminAgenciesController {
  constructor(
    private readonly adminAgenciesService: AdminAgenciesService,
    private readonly operations: AgencyOperationsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar agencias con métricas' })
  findAll() {
    return this.adminAgenciesService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Crear una agencia con credenciales' })
  create(@Body() dto: CreateAgencyDto) {
    return this.adminAgenciesService.create(dto);
  }

  @Patch(':agencyId')
  @ApiOperation({
    summary:
      'Actualizar agencia (datos, comisión, estado, reset de contraseña)',
  })
  update(
    @Param('agencyId', ParseUUIDPipe) agencyId: string,
    @Body() dto: UpdateAgencyDto,
  ) {
    return this.adminAgenciesService.update(agencyId, dto);
  }

  @Get(':agencyId/account')
  @ApiOperation({ summary: 'Cuenta de la agencia con Chamba' })
  account(@Param('agencyId', ParseUUIDPipe) agencyId: string) {
    return this.operations.getChambaAccount(agencyId);
  }

  @Post(':agencyId/settlements')
  @ApiOperation({ summary: 'Registrar un pago entre Chamba y la agencia' })
  settle(
    @Req() req: any,
    @Param('agencyId', ParseUUIDPipe) agencyId: string,
    @Body() dto: AgencySettlementDto,
  ) {
    return this.operations.createSettlement(agencyId, req.user?.id ?? req.user?.sub ?? null, dto);
  }

  @Delete(':agencyId')
  @ApiOperation({
    summary: 'Eliminar agencia (si no tiene trabajadores u ofertas)',
  })
  remove(@Param('agencyId', ParseUUIDPipe) agencyId: string) {
    return this.adminAgenciesService.remove(agencyId);
  }
}
