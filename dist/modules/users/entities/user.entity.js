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
exports.User = exports.UserType = void 0;
const typeorm_1 = require("typeorm");
const swagger_1 = require("@nestjs/swagger");
var UserType;
(function (UserType) {
    UserType["CLIENT"] = "client";
    UserType["WORKER"] = "worker";
})(UserType || (exports.UserType = UserType = {}));
let User = class User {
    id;
    type;
    email;
    phone;
    firstName;
    lastName;
    profilePhotoUrl;
    profilePhotoPublicId;
    currentLocation;
    workRadiusKm;
    averageRating;
    completedJobs;
    isAvailable;
    createdAt;
    updatedAt;
};
exports.User = User;
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'uuid' }),
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], User.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: UserType, example: UserType.CLIENT }),
    (0, typeorm_1.Column)({ type: 'enum', enum: UserType, default: UserType.CLIENT }),
    __metadata("design:type", String)
], User.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'usuario@chamba.com' }),
    (0, typeorm_1.Column)({ unique: true }),
    __metadata("design:type", String)
], User.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '+59170000000' }),
    (0, typeorm_1.Column)({ unique: true, nullable: true }),
    __metadata("design:type", String)
], User.prototype, "phone", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Juan' }),
    (0, typeorm_1.Column)({ name: 'first_name' }),
    __metadata("design:type", String)
], User.prototype, "firstName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Pérez' }),
    (0, typeorm_1.Column)({ name: 'last_name', nullable: true }),
    __metadata("design:type", String)
], User.prototype, "lastName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'https://cdn.chamba.com/profile.jpg' }),
    (0, typeorm_1.Column)({ name: 'profile_photo_url', nullable: true }),
    __metadata("design:type", String)
], User.prototype, "profilePhotoUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'profile_photo_public_id', nullable: true }),
    __metadata("design:type", String)
], User.prototype, "profilePhotoPublicId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: {
            type: 'Point',
            coordinates: [-68.1193, -16.4897],
        },
    }),
    (0, typeorm_1.Column)({
        name: 'current_location',
        type: 'geography',
        spatialFeatureType: 'Point',
        srid: 4326,
        nullable: true,
    }),
    __metadata("design:type", Object)
], User.prototype, "currentLocation", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 5 }),
    (0, typeorm_1.Column)({ name: 'work_radius_km', type: 'float', default: 5 }),
    __metadata("design:type", Number)
], User.prototype, "workRadiusKm", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 4.7 }),
    (0, typeorm_1.Column)({ name: 'average_rating', type: 'float', default: 0 }),
    __metadata("design:type", Number)
], User.prototype, "averageRating", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 25 }),
    (0, typeorm_1.Column)({ name: 'completed_jobs', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], User.prototype, "completedJobs", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true }),
    (0, typeorm_1.Column)({ name: 'is_available', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], User.prototype, "isAvailable", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: String, example: '2026-03-08T22:42:26.170Z' }),
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], User.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: String, example: '2026-03-08T22:42:26.170Z' }),
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at' }),
    __metadata("design:type", Date)
], User.prototype, "updatedAt", void 0);
exports.User = User = __decorate([
    (0, typeorm_1.Entity)({ name: 'users' })
], User);
//# sourceMappingURL=user.entity.js.map