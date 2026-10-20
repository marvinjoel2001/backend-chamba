import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AdminWebContactController, WebContactController } from './web-contact.controller';
import { WebContactService } from './web-contact.service';

@Module({
  imports: [AccessModule, RealtimeModule],
  controllers: [WebContactController, AdminWebContactController],
  providers: [WebContactService],
})
export class WebContactModule {}
