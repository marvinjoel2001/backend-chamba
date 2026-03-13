"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const core_1 = require("@nestjs/core");
const connect_redis_1 = require("connect-redis");
const express_session_1 = __importDefault(require("express-session"));
const express_1 = require("express");
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
const redis_constants_1 = require("./infrastructure/redis/redis.constants");
if (!globalThis.crypto) {
    Object.defineProperty(globalThis, 'crypto', {
        value: node_crypto_1.webcrypto,
        configurable: true,
    });
}
async function bootstrap() {
    const logger = new common_1.Logger('Bootstrap');
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const configService = app.get(config_1.ConfigService);
    const redisClient = app.get(redis_constants_1.REDIS_CLIENT);
    const sessionTtlSeconds = configService.get('SESSION_TTL_SECONDS', 86400);
    const isProduction = configService.get('NODE_ENV') === 'production';
    const requestBodyLimit = '15mb';
    app.setGlobalPrefix('api');
    app.enableCors();
    app.use((0, express_1.json)({ limit: requestBodyLimit }));
    app.use((0, express_1.urlencoded)({ extended: true, limit: requestBodyLimit }));
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
    }));
    const swaggerConfig = new swagger_1.DocumentBuilder()
        .setTitle('Chamba Backend API')
        .setDescription('Documentación de endpoints HTTP de Chamba')
        .setVersion('1.0')
        .build();
    const swaggerDocument = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
    swagger_1.SwaggerModule.setup('api/docs', app, swaggerDocument);
    app.use((0, express_session_1.default)({
        store: new connect_redis_1.RedisStore({
            client: redisClient,
            prefix: 'sess:',
        }),
        secret: configService.getOrThrow('SESSION_SECRET'),
        saveUninitialized: false,
        resave: false,
        cookie: {
            httpOnly: true,
            secure: isProduction,
            maxAge: sessionTtlSeconds * 1000,
            sameSite: 'lax',
        },
    }));
    const port = Number(process.env.PORT ?? configService.get('PORT', 3000));
    const host = '0.0.0.0';
    await app.listen(port, host);
    logger.log(`Backend disponible en http://localhost:${port}/api`);
    logger.log(`Swagger disponible en http://localhost:${port}/api/docs`);
}
void bootstrap();
//# sourceMappingURL=main.js.map