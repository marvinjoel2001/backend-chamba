import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { BotsController } from './bots.controller';
import { BotsService } from './bots.service';

@Module({
  imports: [AccessModule],
  controllers: [BotsController],
  providers: [BotsService],
})
export class BotsModule {}
