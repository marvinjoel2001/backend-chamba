import { Controller, Get, Post, Body, Patch, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WorkerLeadsService } from './worker-leads.service';
import { CreateWorkerLeadDto } from './dto/create-worker-lead.dto';

@ApiTags('worker-leads')
@Controller('worker-leads')
export class WorkerLeadsController {
  constructor(private readonly workerLeadsService: WorkerLeadsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new worker lead' })
  @ApiResponse({ status: 201, description: 'Lead successfully created.' })
  create(@Body() createWorkerLeadDto: CreateWorkerLeadDto) {
    return this.workerLeadsService.create(createWorkerLeadDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all worker leads' })
  findAll() {
    return this.workerLeadsService.findAll();
  }

  @Patch(':id/contacted')
  @ApiOperation({ summary: 'Mark a worker lead as contacted' })
  markAsContacted(@Param('id') id: string) {
    return this.workerLeadsService.markAsContacted(id);
  }
}
