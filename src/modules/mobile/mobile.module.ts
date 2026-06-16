import { Module } from '@nestjs/common';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { QueuesModule } from '../queues/queues.module';
import { ApiLogsModule } from '../api-logs/api-logs.module';
import { MobileController } from './mobile.controller';
import { MobileService } from './mobile.service';
import { MobileRequestRepository } from './shared/mobile-request.repository';
import { MobileGeoHelpers } from './shared/mobile-geo.helpers';
import { MobileCatalogService } from './services/mobile-catalog.service';
import { MobileChatService } from './services/mobile-chat.service';
import { MobileDisputesService } from './services/mobile-disputes.service';
import { MobileOffersService } from './services/mobile-offers.service';
import { MobileRequestsService } from './services/mobile-requests.service';
import { MobileUsersService } from './services/mobile-users.service';
import { MobileAdminService } from './services/mobile-admin.service';
import { WaveDispatchProcessorService } from './services/wave-dispatch.processor.service';

@Module({
  imports: [
    StorageModule,
    NotificationsModule,
    RealtimeModule,
    QueuesModule,
    ApiLogsModule,
  ],
  controllers: [MobileController],
  providers: [
    MobileService,
    MobileRequestRepository,
    MobileGeoHelpers,
    MobileCatalogService,
    MobileChatService,
    MobileDisputesService,
    MobileOffersService,
    MobileRequestsService,
    MobileUsersService,
    MobileAdminService,
    WaveDispatchProcessorService,
  ],
  exports: [MobileService],
})
export class MobileModule {}
