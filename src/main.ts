import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { createServer } from 'node:net';
import { RedisStore } from 'connect-redis';
import session from 'express-session';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { REDIS_CLIENT } from './infrastructure/redis/redis.constants';
import type { RedisClient } from './infrastructure/redis/redis.types';

async function findAvailablePort(startPort: number): Promise<number> {
  let port = startPort;

  while (true) {
    const isAvailable = await new Promise<boolean>((resolve) => {
      const server = createServer();

      server.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          resolve(false);
          return;
        }

        resolve(false);
      });

      server.once('listening', () => {
        server.close(() => resolve(true));
      });

      server.listen(port);
    });

    if (isAvailable) {
      return port;
    }

    port += 1;
  }
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

  app.setGlobalPrefix('api');
  app.enableCors();
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

  const configuredPort = configService.get<number>('PORT', 3000);
  const port = await findAvailablePort(configuredPort);
  if (port !== configuredPort) {
    logger.warn(`Puerto ${configuredPort} en uso, usando puerto ${port}`);
  }

  await app.listen(port);
  logger.log(`Backend disponible en http://localhost:${port}/api`);
  logger.log(`Swagger disponible en http://localhost:${port}/api/docs`);
}

void bootstrap();
