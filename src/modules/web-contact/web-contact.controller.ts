import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAccessGuard } from '../access/mobile-access.guard';
import { WebReportDto, WebSubscribeDto } from './web-contact.dto';
import { WebContactService } from './web-contact.service';

/** Formularios públicos de la landing (sin sesión). */
@ApiTags('Web contact')
@Controller('web')
export class WebContactController {
  constructor(private readonly service: WebContactService) {}

  @Post('reports')
  @ApiOperation({ summary: 'Reporte enviado desde "Reportar un problema" de la web' })
  report(@Body() dto: WebReportDto) {
    return this.service.createReport(dto);
  }

  @Post('subscribe')
  @ApiOperation({ summary: 'Suscripción al boletín desde la web' })
  subscribe(@Body() dto: WebSubscribeDto) {
    return this.service.subscribe(dto);
  }
}

/** Bandeja del admin con lo que llegó desde la web. */
@ApiTags('Admin web contact')
@UseGuards(AdminAccessGuard)
@Controller('mobile/admin/web-contact')
export class AdminWebContactController {
  constructor(private readonly service: WebContactService) {}

  @Get()
  list(@Query('kind') kind?: string) {
    return this.service.list(kind);
  }

  @Post(':id/handled')
  markHandled(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.markHandled(id);
  }
}
