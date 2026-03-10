import { Module } from '@nestjs/common';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MobileController } from './mobile.controller';
import { MobileService } from './mobile.service';

@Module({
  imports: [StorageModule, NotificationsModule],
  controllers: [MobileController],
  providers: [MobileService],
  exports: [MobileService],
})
export class MobileModule {}
