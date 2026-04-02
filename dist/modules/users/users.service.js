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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const redis_service_1 = require("../../infrastructure/redis/redis.service");
const realtime_gateway_1 = require("../realtime/realtime.gateway");
const user_entity_1 = require("./entities/user.entity");
const USERS_ALL_CACHE_KEY = 'users:all';
const USER_CACHE_PREFIX = 'users:';
const USER_CACHE_TTL = 120;
let UsersService = class UsersService {
    usersRepository;
    redisService;
    realtimeGateway;
    constructor(usersRepository, redisService, realtimeGateway) {
        this.usersRepository = usersRepository;
        this.redisService = redisService;
        this.realtimeGateway = realtimeGateway;
    }
    async create(createUserDto) {
        const existingEmail = await this.usersRepository.findOne({
            where: { email: createUserDto.email },
        });
        if (existingEmail) {
            throw new common_1.ConflictException('A user with this email already exists');
        }
        if (createUserDto.phone) {
            const existingPhone = await this.usersRepository.findOne({
                where: { phone: createUserDto.phone },
            });
            if (existingPhone) {
                throw new common_1.ConflictException('A user with this phone already exists');
            }
        }
        const user = this.usersRepository.create(createUserDto);
        const saved = await this.usersRepository.save(user);
        await this.redisService.del(USERS_ALL_CACHE_KEY);
        this.realtimeGateway.broadcastUserCreated(saved);
        return saved;
    }
    async findAll() {
        const cachedUsers = await this.redisService.get(USERS_ALL_CACHE_KEY);
        if (cachedUsers) {
            return cachedUsers;
        }
        const users = await this.usersRepository.find({
            order: { createdAt: 'DESC' },
        });
        await this.redisService.set(USERS_ALL_CACHE_KEY, users, USER_CACHE_TTL);
        return users;
    }
    async findOne(id) {
        const cacheKey = `${USER_CACHE_PREFIX}${id}`;
        const cachedUser = await this.redisService.get(cacheKey);
        if (cachedUser) {
            return cachedUser;
        }
        const user = await this.usersRepository.findOne({ where: { id } });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        await this.redisService.set(cacheKey, user, USER_CACHE_TTL);
        return user;
    }
    async update(id, updateUserDto) {
        const user = await this.findOne(id);
        if (updateUserDto.phone && updateUserDto.phone !== user.phone) {
            const existingPhone = await this.usersRepository.findOne({
                where: { phone: updateUserDto.phone },
            });
            if (existingPhone) {
                throw new common_1.ConflictException('A user with this phone already exists');
            }
        }
        const merged = this.usersRepository.merge(user, updateUserDto);
        const updated = await this.usersRepository.save(merged);
        await this.redisService.del(USERS_ALL_CACHE_KEY);
        await this.redisService.del(`${USER_CACHE_PREFIX}${id}`);
        return updated;
    }
    async findNearbyWorkers(params) {
        const { latitude, longitude, radiusKm } = params;
        if (radiusKm <= 0) {
            throw new common_1.BadRequestException('radiusKm must be greater than 0');
        }
        return this.usersRepository
            .createQueryBuilder('user')
            .where('user.type = :type', { type: user_entity_1.UserType.WORKER })
            .andWhere('user.is_available = true')
            .andWhere('user.current_location IS NOT NULL')
            .andWhere(`ST_DWithin(
          user.current_location,
          ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography,
          :radiusMeters
        )`, {
            latitude,
            longitude,
            radiusMeters: radiusKm * 1000,
        })
            .orderBy(`ST_Distance(
          user.current_location,
          ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography
        )`, 'ASC')
            .setParameters({ latitude, longitude })
            .getMany();
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeof (_a = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _a : Object, redis_service_1.RedisService,
        realtime_gateway_1.RealtimeGateway])
], UsersService);
//# sourceMappingURL=users.service.js.map