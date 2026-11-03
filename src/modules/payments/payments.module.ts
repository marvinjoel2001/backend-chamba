import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { StripeModule } from '../stripe/stripe.module';
import {
  AdminPaymentsController,
  PaymentsController,
} from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentProvidersRegistry, StripeCardProvider } from './providers';

@Module({
  imports: [AccessModule, StripeModule, NotificationsModule, RealtimeModule],
  controllers: [AdminPaymentsController, PaymentsController],
  providers: [PaymentsService, PaymentProvidersRegistry, StripeCardProvider],
  exports: [PaymentsService],
})
export class PaymentsModule {}
