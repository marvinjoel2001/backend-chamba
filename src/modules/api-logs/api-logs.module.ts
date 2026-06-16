import { Module } from '@nestjs/common';
import { ApiLogsController } from './api-logs.controller';
import { ApiLogsService } from './api-logs.service';

@Module({
  controllers: [ApiLogsController],
  providers: [ApiLogsService],
  exports: [ApiLogsService],
})
export class ApiLogsModule {}
