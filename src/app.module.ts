import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpLoggerInterceptor } from './common/interceptors/http-logger.interceptor';
import { envValidationSchema } from './config/env.validation';
import { ApiLogsModule } from './modules/api-logs/api-logs.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { PushModule } from './infrastructure/push/push.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { StorageModule } from './infrastructure/storage/storage.module';
import { HealthModule } from './modules/health/health.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { MobileModule } from './modules/mobile/mobile.module';
import { PlaceholdersModule } from './modules/placeholders/placeholders.module';
import { QueuesModule } from './modules/queues/queues.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { UsersModule } from './modules/users/users.module';
import { PaymentMethodsModule } from './modules/payment-methods/payment-methods.module';
import { WorkerLeadsModule } from './modules/worker-leads/worker-leads.module';
import { AuthModule } from './modules/auth/auth.module';
import { AdminUsersModule } from './modules/admin-users/admin-users.module';
import { AgencyModule } from './modules/agency/agency.module';

const envFilePath =
  process.env.NODE_ENV === 'production'
    ? ['.env.production', '.env']
    : ['.env.local', '.env'];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath,
      validationSchema: envValidationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    ApiLogsModule,
    DatabaseModule,
    RedisModule,
    PushModule,
    StorageModule,
    ScheduleModule.forRoot(),
    HealthModule,
    UsersModule,
    RealtimeModule,
    QueuesModule,
    NotificationsModule,
    MobileModule,
    PlaceholdersModule,
    PaymentMethodsModule,
    WorkerLeadsModule,
    AdminUsersModule,
    AuthModule,
    AgencyModule,
  ],
  providers: [HttpLoggerInterceptor],
})
export class AppModule {}
