import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { ApiLogsController } from './api-logs.controller';
import { ApiLogsService } from './api-logs.service';

@Module({
  imports: [AccessModule],
  controllers: [ApiLogsController],
  providers: [ApiLogsService],
  exports: [ApiLogsService],
})
export class ApiLogsModule {}
