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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const redis_service_1 = require("../../infrastructure/redis/redis.service");
let HealthService = class HealthService {
    dataSource;
    redisService;
    constructor(dataSource, redisService) {
        this.dataSource = dataSource;
        this.redisService = redisService;
    }
    async check() {
        const [dbProbe] = await this.dataSource.query('SELECT NOW() as db_now, postgis_version() as postgis_version;');
        const redisProbe = await this.redisService.client.ping();
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            dependencies: {
                postgres: {
                    connected: true,
                    dbTime: dbProbe.db_now,
                },
                postgis: {
                    enabled: true,
                    version: dbProbe.postgis_version,
                },
                redis: {
                    connected: redisProbe === 'PONG',
                },
            },
        };
    }
};
exports.HealthService = HealthService;
exports.HealthService = HealthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource,
        redis_service_1.RedisService])
], HealthService);
//# sourceMappingURL=health.service.js.map