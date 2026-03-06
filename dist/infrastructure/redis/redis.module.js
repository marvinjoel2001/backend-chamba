"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const redis_1 = require("redis");
const redis_constants_1 = require("./redis.constants");
const redis_service_1 = require("./redis.service");
let RedisModule = class RedisModule {
    redisClient;
    constructor(redisClient) {
        this.redisClient = redisClient;
    }
    async onModuleDestroy() {
        await this.redisClient.quit();
    }
};
exports.RedisModule = RedisModule;
exports.RedisModule = RedisModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [config_1.ConfigModule],
        providers: [
            {
                provide: redis_constants_1.REDIS_CLIENT,
                inject: [config_1.ConfigService],
                useFactory: async (configService) => {
                    const host = configService.getOrThrow('REDIS_HOST');
                    const port = configService.getOrThrow('REDIS_PORT');
                    const useTls = configService.get('REDIS_TLS', false);
                    const client = (0, redis_1.createClient)({
                        socket: useTls
                            ? {
                                host,
                                port,
                                tls: true,
                            }
                            : {
                                host,
                                port,
                            },
                        password: configService.get('REDIS_PASSWORD') || undefined,
                        database: configService.get('REDIS_DB', 0),
                    });
                    client.on('error', (error) => {
                        common_1.Logger.error(error, 'RedisClient');
                    });
                    await client.connect();
                    return client;
                },
            },
            redis_service_1.RedisService,
        ],
        exports: [redis_constants_1.REDIS_CLIENT, redis_service_1.RedisService],
    }),
    __param(0, (0, common_1.Inject)(redis_constants_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [Object])
], RedisModule);
//# sourceMappingURL=redis.module.js.map