"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const database_bootstrap_service_1 = require("./database.bootstrap.service");
let DatabaseModule = class DatabaseModule {
};
exports.DatabaseModule = DatabaseModule;
exports.DatabaseModule = DatabaseModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forRootAsync({
                imports: [config_1.ConfigModule],
                inject: [config_1.ConfigService],
                useFactory: (configService) => ({
                    type: 'postgres',
                    host: configService.getOrThrow('DATABASE_HOST'),
                    port: configService.getOrThrow('DATABASE_PORT'),
                    username: configService.getOrThrow('DATABASE_USERNAME'),
                    password: configService.getOrThrow('DATABASE_PASSWORD'),
                    database: configService.getOrThrow('DATABASE_NAME'),
                    synchronize: configService.get('DATABASE_SYNC', false),
                    ssl: configService.get('DATABASE_SSL', false)
                        ? { rejectUnauthorized: false }
                        : false,
                    autoLoadEntities: true,
                }),
            }),
        ],
        providers: [database_bootstrap_service_1.DatabaseBootstrapService],
    })
], DatabaseModule);
//# sourceMappingURL=database.module.js.map