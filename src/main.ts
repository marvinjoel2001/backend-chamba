import { webcrypto } from 'node:crypto';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { RedisStore } from 'connect-redis';
import session from 'express-session';
import { json, urlencoded } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { REDIS_CLIENT } from './infrastructure/redis/redis.constants';
import type { RedisClient } from './infrastructure/redis/redis.types';

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const redisClient = app.get<RedisClient>(REDIS_CLIENT);

  const sessionTtlSeconds = configService.get<number>(
    'SESSION_TTL_SECONDS',
    86400,
  );
  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  const requestBodyLimit = '15mb';

  app.setGlobalPrefix('api');
  app.enableCors();
  app.use(json({ limit: requestBodyLimit }));
  app.use(urlencoded({ extended: true, limit: requestBodyLimit }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Chamba Backend API')
    .setDescription('Documentación de endpoints HTTP de Chamba')
    .setVersion('1.0')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);

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

  const port = Number(
    process.env.PORT ?? configService.get<number>('PORT', 3000),
  );
  const host = '0.0.0.0';
  await app.listen(port, host);
  logger.log(`Backend disponible en http://localhost:${port}/api`);
  logger.log(`Swagger disponible en http://localhost:${port}/api/docs`);
}

void bootstrap();
