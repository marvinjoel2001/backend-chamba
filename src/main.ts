import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { RedisStore } from 'connect-redis';
import session from 'express-session';
import { AppModule } from './app.module';
import { REDIS_CLIENT } from './infrastructure/redis/redis.constants';
import type { RedisClient } from './infrastructure/redis/redis.types';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const redisClient = app.get<RedisClient>(REDIS_CLIENT);

  const sessionTtlSeconds = configService.get<number>(
    'SESSION_TTL_SECONDS',
    86400,
  );
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.use(
    session({
      store: new RedisStore({
        client: redisClient,
        prefix: 'sess:',
      }),
      secret: configService.getOrThrow<string>('SESSION_SECRET'),
      saveUninitialized: false,
      resave: false,
      cookie: {
        httpOnly: true,
        secure: isProduction,
        maxAge: sessionTtlSeconds * 1000,
        sameSite: 'lax',
      },
    }),
  );

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
}

void bootstrap();
