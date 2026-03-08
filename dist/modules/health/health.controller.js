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
exports.HealthController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const health_service_1 = require("./health.service");
class HealthDependencyStatusDto {
    connected;
    dbTime;
    version;
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: true }),
    __metadata("design:type", Boolean)
], HealthDependencyStatusDto.prototype, "connected", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-03-08T22:42:26.170Z', required: false }),
    __metadata("design:type", String)
], HealthDependencyStatusDto.prototype, "dbTime", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '3.5 USE_GEOS=1 USE_PROJ=1 USE_STATS=1',
        required: false,
    }),
    __metadata("design:type", String)
], HealthDependencyStatusDto.prototype, "version", void 0);
class HealthResponseDto {
    status;
    timestamp;
    dependencies;
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'ok' }),
    __metadata("design:type", String)
], HealthResponseDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-03-08T22:42:26.254Z' }),
    __metadata("design:type", String)
], HealthResponseDto.prototype, "timestamp", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: Object,
        example: {
            postgres: {
                connected: true,
                dbTime: '2026-03-08T22:42:26.170Z',
            },
            postgis: {
                enabled: true,
                version: '3.5 USE_GEOS=1 USE_PROJ=1 USE_STATS=1',
            },
            redis: {
                connected: true,
            },
        },
    }),
    __metadata("design:type", Object)
], HealthResponseDto.prototype, "dependencies", void 0);
let HealthController = class HealthController {
    healthService;
    constructor(healthService) {
        this.healthService = healthService;
    }
    check() {
        return this.healthService.check();
    }
};
exports.HealthController = HealthController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Verificar estado del backend y dependencias' }),
    (0, swagger_1.ApiOkResponse)({ type: HealthResponseDto }),
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], HealthController.prototype, "check", null);
exports.HealthController = HealthController = __decorate([
    (0, swagger_1.ApiTags)('Health'),
    (0, common_1.Controller)('health'),
    __metadata("design:paramtypes", [health_service_1.HealthService])
], HealthController);
//# sourceMappingURL=health.controller.js.map