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
exports.UsersController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const create_user_dto_1 = require("./dto/create-user.dto");
const review_worker_verification_dto_1 = require("./dto/review-worker-verification.dto");
const update_user_dto_1 = require("./dto/update-user.dto");
const user_entity_1 = require("./entities/user.entity");
const users_service_1 = require("./users.service");
let UsersController = class UsersController {
    usersService;
    constructor(usersService) {
        this.usersService = usersService;
    }
    create(createUserDto) {
        return this.usersService.create(createUserDto);
    }
    findAll() {
        return this.usersService.findAll();
    }
    findNearbyWorkers(latitude, longitude, radiusKm = 2) {
        return this.usersService.findNearbyWorkers({
            latitude,
            longitude,
            radiusKm,
        });
    }
    getWorkerVerificationInbox() {
        return this.usersService.getWorkerVerificationInbox();
    }
    reviewWorkerVerification(id, body) {
        return this.usersService.reviewWorkerVerification(id, body);
    }
    findOne(id) {
        return this.usersService.findOne(id);
    }
    update(id, updateUserDto) {
        return this.usersService.update(id, updateUserDto);
    }
    uploadVerificationPhotos(id, idPhoto, body) {
        return this.usersService.uploadVerificationPhotos(id, idPhoto, body.facePhotoUrl);
    }
    async remove(id) {
        return this.usersService.softDelete(id);
    }
};
exports.UsersController = UsersController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Crear usuario' }),
    (0, swagger_1.ApiBody)({ type: create_user_dto_1.CreateUserDto }),
    (0, swagger_1.ApiCreatedResponse)({ type: user_entity_1.User }),
    (0, swagger_1.ApiConflictResponse)({
        description: 'Ya existe un usuario con email o teléfono',
    }),
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_user_dto_1.CreateUserDto]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "create", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Listar usuarios' }),
    (0, swagger_1.ApiOkResponse)({ type: user_entity_1.User, isArray: true }),
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "findAll", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Buscar trabajadores cercanos' }),
    (0, swagger_1.ApiQuery)({ name: 'lat', type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'lng', type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'radiusKm', type: Number, required: false, example: 2 }),
    (0, swagger_1.ApiOkResponse)({ type: user_entity_1.User, isArray: true }),
    (0, swagger_1.ApiBadRequestResponse)({ description: 'radiusKm debe ser mayor a 0' }),
    (0, common_1.Get)('nearby/workers'),
    __param(0, (0, common_1.Query)('lat', common_1.ParseFloatPipe)),
    __param(1, (0, common_1.Query)('lng', common_1.ParseFloatPipe)),
    __param(2, (0, common_1.Query)('radiusKm', common_1.ParseFloatPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, Object]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "findNearbyWorkers", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Listar buzon de verificaciones de workers pendientes' }),
    (0, swagger_1.ApiOkResponse)({ type: user_entity_1.User, isArray: true }),
    (0, common_1.Get)('verification/workers/inbox'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "getWorkerVerificationInbox", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Revisar verificacion de worker (carnet/selfie por separado)' }),
    (0, swagger_1.ApiParam)({ name: 'id', format: 'uuid' }),
    (0, swagger_1.ApiBody)({ type: review_worker_verification_dto_1.ReviewWorkerVerificationDto }),
    (0, swagger_1.ApiOkResponse)({ type: user_entity_1.User }),
    (0, common_1.Patch)(':id/verification/review'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, review_worker_verification_dto_1.ReviewWorkerVerificationDto]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "reviewWorkerVerification", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Obtener usuario por id' }),
    (0, swagger_1.ApiParam)({ name: 'id', format: 'uuid' }),
    (0, swagger_1.ApiOkResponse)({ type: user_entity_1.User }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Usuario no encontrado' }),
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "findOne", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Actualizar usuario por id' }),
    (0, swagger_1.ApiParam)({ name: 'id', format: 'uuid' }),
    (0, swagger_1.ApiBody)({ type: update_user_dto_1.UpdateUserDto }),
    (0, swagger_1.ApiOkResponse)({ type: user_entity_1.User }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Usuario no encontrado' }),
    (0, swagger_1.ApiConflictResponse)({
        description: 'Teléfono ya registrado por otro usuario',
    }),
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_user_dto_1.UpdateUserDto]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "update", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Subir fotos de verificación de identidad' }),
    (0, swagger_1.ApiParam)({ name: 'id', format: 'uuid' }),
    (0, swagger_1.ApiOkResponse)({ type: user_entity_1.User }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Usuario no encontrado' }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('idPhoto')),
    (0, common_1.Post)(':id/verification-photos'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "uploadVerificationPhotos", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Desactivar (soft-delete) usuario por id' }),
    (0, swagger_1.ApiParam)({ name: 'id', format: 'uuid' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Usuario desactivado' }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Usuario no encontrado' }),
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "remove", null);
exports.UsersController = UsersController = __decorate([
    (0, swagger_1.ApiTags)('Users'),
    (0, common_1.Controller)('users'),
    __metadata("design:paramtypes", [users_service_1.UsersService])
], UsersController);
//# sourceMappingURL=users.controller.js.map