import { Module } from '@nestjs/common';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { AccessModule } from '../access/access.module';
import { StripeModule } from '../stripe/stripe.module';
import { AdminPaymentsController, PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import {
  ManualQrProvider,
  PaymentProvidersRegistry,
  StripeCardProvider,
} from './providers';

@Module({
  imports: [AccessModule, StripeModule, StorageModule],
  controllers: [AdminPaymentsController, PaymentsController],
  providers: [PaymentsService, PaymentProvidersRegistry, ManualQrProvider, StripeCardProvider],
  exports: [PaymentsService],
})
export class PaymentsModule {}
