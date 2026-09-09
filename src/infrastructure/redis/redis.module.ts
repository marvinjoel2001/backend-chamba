import {
  Global,
  Inject,
  Logger,
  Module,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';
import type { RedisClient } from './redis.types';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: async (
        configService: ConfigService,
      ): Promise<RedisClient> => {
        const rawHost = configService.get<string>('REDIS_HOST');
        const redisUrl =
          configService.get<string>('REDIS_URL') ||
          (rawHost?.includes('://') ? rawHost : undefined);

        const client = redisUrl
          ? createClient({ url: redisUrl })
          : createClient({
              socket: configService.get<boolean>('REDIS_TLS', false)
                ? {
                    host: configService.getOrThrow<string>('REDIS_HOST'),
                    port: configService.getOrThrow<number>('REDIS_PORT'),
                    tls: true,
                  }
                : {
                    host: configService.getOrThrow<string>('REDIS_HOST'),
                    port: configService.getOrThrow<number>('REDIS_PORT'),
                  },
              password: configService.get<string>('REDIS_PASSWORD') || undefined,
              database: configService.get<number>('REDIS_DB', 0),
            });

        client.on('error', (error) => {
          Logger.error(error, 'RedisClient');
        });

        await client.connect();
        return client;
      },
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule implements OnModuleDestroy {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: RedisClient,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.redisClient.quit();
  }
}
