import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './infrastructure/database/database.module';
import { PushModule } from './infrastructure/push/push.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { StorageModule } from './infrastructure/storage/storage.module';
import { HealthModule } from './modules/health/health.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PlaceholdersModule } from './modules/placeholders/placeholders.module';
import { QueuesModule } from './modules/queues/queues.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
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
    PlaceholdersModule,
  ],
})
export class AppModule {}
