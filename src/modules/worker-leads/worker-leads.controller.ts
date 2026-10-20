import { Controller, Get, Post, Body, Patch, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AdminAccessGuard } from '../access/mobile-access.guard';
import { WorkerLeadsService } from './worker-leads.service';
import { CreateWorkerLeadDto } from './dto/create-worker-lead.dto';

@ApiTags('worker-leads')
@Controller('worker-leads')
export class WorkerLeadsController {
  constructor(private readonly workerLeadsService: WorkerLeadsService) {}

  // Crear un lead es público (formulario web); leerlos y marcarlos es del admin.
  @Post()
  @ApiOperation({ summary: 'Create a new worker lead' })
  @ApiResponse({ status: 201, description: 'Lead successfully created.' })
  create(@Body() createWorkerLeadDto: CreateWorkerLeadDto) {
    return this.workerLeadsService.create(createWorkerLeadDto);
  }

  @Get()
  @UseGuards(AdminAccessGuard)
  @ApiOperation({ summary: 'Get all worker leads' })
  findAll() {
    return this.workerLeadsService.findAll();
  }

  @Patch(':id/contacted')
  @UseGuards(AdminAccessGuard)
  @ApiOperation({ summary: 'Mark a worker lead as contacted' })
  markAsContacted(@Param('id') id: string) {
    return this.workerLeadsService.markAsContacted(id);
  }
}
