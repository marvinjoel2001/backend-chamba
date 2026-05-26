import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiLogsService } from './api-logs.service';

@ApiTags('Admin API Logs')
@Controller('mobile/admin/logs')
export class ApiLogsController {
  constructor(private readonly apiLogsService: ApiLogsService) {}

  @Get()
  list(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('method') method?: string,
    @Query('statusMin') statusMin?: string,
    @Query('statusMax') statusMax?: string,
    @Query('search') search?: string,
  ) {
    return this.apiLogsService.list({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      method,
      statusMin: statusMin ? Number(statusMin) : undefined,
      statusMax: statusMax ? Number(statusMax) : undefined,
      search,
    });
  }

  @Get('grafana/timeseries')
  grafanaTimeseries(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('intervalMinutes') intervalMinutes?: string,
  ) {
    return this.apiLogsService.grafanaTimeseries({
      from,
      to,
      intervalMinutes: intervalMinutes ? Number(intervalMinutes) : undefined,
    });
  }

  @Get('grafana/top-paths')
  grafanaTopPaths(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.apiLogsService.grafanaTopPaths({
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
