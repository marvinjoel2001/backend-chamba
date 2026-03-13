import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envValidationSchema } from './config/env.validation';
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
    DatabaseModule,
    RedisModule,
    PushModule,
    StorageModule,
    HealthModule,
    UsersModule,
    RealtimeModule,
    QueuesModule,
    NotificationsModule,
    MobileModule,
    PlaceholdersModule,
  ],
})
export class AppModule {}
