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
exports.RedisService = void 0;
const common_1 = require("@nestjs/common");
const redis_constants_1 = require("./redis.constants");
let RedisService = class RedisService {
    redisClient;
    constructor(redisClient) {
        this.redisClient = redisClient;
    }
    get client() {
        return this.redisClient;
    }
    async get(key) {
        const value = await this.redisClient.get(key);
        if (!value) {
            return null;
        }
        return JSON.parse(value);
    }
    async set(key, value, ttlInSeconds) {
        const serialized = JSON.stringify(value);
        if (ttlInSeconds) {
            await this.redisClient.set(key, serialized, {
                EX: ttlInSeconds,
            });
            return;
        }
        await this.redisClient.set(key, serialized);
    }
    async del(key) {
        await this.redisClient.del(key);
    }
};
exports.RedisService = RedisService;
exports.RedisService = RedisService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(redis_constants_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [Object])
], RedisService);
//# sourceMappingURL=redis.service.js.map