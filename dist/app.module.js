"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const env_validation_1 = require("./config/env.validation");
const database_module_1 = require("./infrastructure/database/database.module");
const push_module_1 = require("./infrastructure/push/push.module");
const redis_module_1 = require("./infrastructure/redis/redis.module");
const storage_module_1 = require("./infrastructure/storage/storage.module");
const health_module_1 = require("./modules/health/health.module");
const notifications_module_1 = require("./modules/notifications/notifications.module");
const placeholders_module_1 = require("./modules/placeholders/placeholders.module");
const queues_module_1 = require("./modules/queues/queues.module");
const realtime_module_1 = require("./modules/realtime/realtime.module");
const users_module_1 = require("./modules/users/users.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: ['.env.local', '.env'],
                validationSchema: env_validation_1.envValidationSchema,
                validationOptions: {
                    allowUnknown: true,
                    abortEarly: false,
                },
            }),
            database_module_1.DatabaseModule,
            redis_module_1.RedisModule,
            push_module_1.PushModule,
            storage_module_1.StorageModule,
            health_module_1.HealthModule,
            users_module_1.UsersModule,
            realtime_module_1.RealtimeModule,
            queues_module_1.QueuesModule,
            notifications_module_1.NotificationsModule,
            placeholders_module_1.PlaceholdersModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map