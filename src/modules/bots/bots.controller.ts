import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminAccessGuard } from '../access/mobile-access.guard';
import { BotsService } from './bots.service';
import { BotProfileDto, BotSettingsDto, RunBotDto } from './bots.dto';
import type { Request } from 'express';
import type { Principal } from '../access/access.service';

@Controller('admin/bots')
@UseGuards(AdminAccessGuard)
export class BotsController {
  constructor(private readonly bots: BotsService) {}
  @Get() snapshot() {
    return this.bots.snapshot();
  }
  @Patch('settings') settings(
    @Body() dto: BotSettingsDto,
    @Req() req: Request & { principal: Principal },
  ) {
    return this.bots.configure(dto, req.principal.id);
  }
  @Patch('profiles/:id') profile(
    @Param('id') id: string,
    @Body() dto: BotProfileDto,
    @Req() req: Request & { principal: Principal },
  ) {
    return this.bots.profile(id, dto, req.principal.id);
  }
  @Post('provision') provision(@Req() req: Request & { principal: Principal }) {
    return this.bots.provision(req.principal.id);
  }
  @Post('start') start(@Req() req: Request & { principal: Principal }) {
    return this.bots.control('start', req.principal.id);
  }
  @Post('pause') pause(@Req() req: Request & { principal: Principal }) {
    return this.bots.control('pause', req.principal.id);
  }
  @Post('stop') stop(@Req() req: Request & { principal: Principal }) {
    return this.bots.control('stop', req.principal.id);
  }
  @Post('run-once') run(
    @Body() dto: RunBotDto,
    @Req() req: Request & { principal: Principal },
  ) {
    return this.bots.runOnce(dto.requestId, req.principal.id);
  }
}
