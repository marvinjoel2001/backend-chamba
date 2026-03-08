"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const core_1 = require("@nestjs/core");
const connect_redis_1 = require("connect-redis");
const express_session_1 = __importDefault(require("express-session"));
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
const redis_constants_1 = require("./infrastructure/redis/redis.constants");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const configService = app.get(config_1.ConfigService);
    const redisClient = app.get(redis_constants_1.REDIS_CLIENT);
    const sessionTtlSeconds = configService.get('SESSION_TTL_SECONDS', 86400);
    const isProduction = configService.get('NODE_ENV') === 'production';
    app.setGlobalPrefix('api');
    app.enableCors();
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
    const port = configService.get('PORT', 3000);
    await app.listen(port);
}
void bootstrap();
//# sourceMappingURL=main.js.map