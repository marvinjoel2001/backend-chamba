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
exports.User = exports.VerificationStatus = exports.UserType = void 0;
const typeorm_1 = require("typeorm");
const swagger_1 = require("@nestjs/swagger");
var UserType;
(function (UserType) {
    UserType["CLIENT"] = "client";
    UserType["WORKER"] = "worker";
})(UserType || (exports.UserType = UserType = {}));
var VerificationStatus;
(function (VerificationStatus) {
    VerificationStatus["NOT_VERIFIED"] = "not_verified";
    VerificationStatus["PENDING"] = "pending";
    VerificationStatus["VERIFIED"] = "verified";
})(VerificationStatus || (exports.VerificationStatus = VerificationStatus = {}));
let User = class User {
    id;
    type;
    email;
    phone;
    countryCode;
    ciNumber;
    verificationStatus;
    idPhotoUrl;
    facePhotoUrl;
    idPhotoVerified;
    facePhotoVerified;
    verificationReviewedAt;
    firstName;
    lastName;
    profilePhotoUrl;
    profilePhotoPublicId;
    currentLocation;
    workRadiusKm;
    averageRating;
    completedJobs;
    isAvailable;
    isBlocked;
    workModalities;
    hourlyRate;
    dailyRate;
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
    (0, swagger_1.ApiPropertyOptional)({ example: '70000000' }),
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], User.prototype, "phone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '+591' }),
    (0, typeorm_1.Column)({ name: 'country_code', nullable: true }),
    __metadata("design:type", String)
], User.prototype, "countryCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '12345678' }),
    (0, typeorm_1.Column)({ name: 'ci_number', nullable: true }),
    __metadata("design:type", String)
], User.prototype, "ciNumber", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        enum: VerificationStatus,
        example: VerificationStatus.NOT_VERIFIED,
    }),
    (0, typeorm_1.Column)({
        name: 'verification_status',
        type: 'enum',
        enum: VerificationStatus,
        default: VerificationStatus.NOT_VERIFIED,
    }),
    __metadata("design:type", String)
], User.prototype, "verificationStatus", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'https://cdn.chamba.com/id-photo.jpg' }),
    (0, typeorm_1.Column)({ name: 'id_photo_url', nullable: true }),
    __metadata("design:type", String)
], User.prototype, "idPhotoUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'https://cdn.chamba.com/face-photo.jpg' }),
    (0, typeorm_1.Column)({ name: 'face_photo_url', nullable: true }),
    __metadata("design:type", String)
], User.prototype, "facePhotoUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: true, nullable: true }),
    (0, typeorm_1.Column)({ name: 'id_photo_verified', type: 'boolean', nullable: true }),
    __metadata("design:type", Object)
], User.prototype, "idPhotoVerified", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: false, nullable: true }),
    (0, typeorm_1.Column)({ name: 'face_photo_verified', type: 'boolean', nullable: true }),
    __metadata("design:type", Object)
], User.prototype, "facePhotoVerified", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        type: String,
        nullable: true,
        example: '2026-05-23T18:12:00.000Z',
    }),
    (0, typeorm_1.Column)({
        name: 'verification_reviewed_at',
        type: 'timestamptz',
        nullable: true,
    }),
    __metadata("design:type", Object)
], User.prototype, "verificationReviewedAt", void 0);
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
    (0, swagger_1.ApiProperty)({ example: false }),
    (0, typeorm_1.Column)({ name: 'is_blocked', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], User.prototype, "isBlocked", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: [String] }),
    (0, typeorm_1.Column)({ name: 'work_modalities', type: 'jsonb', nullable: true }),
    __metadata("design:type", Array)
], User.prototype, "workModalities", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, typeorm_1.Column)({
        name: 'hourly_rate',
        type: 'decimal',
        precision: 10,
        scale: 2,
        nullable: true,
    }),
    __metadata("design:type", Number)
], User.prototype, "hourlyRate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, typeorm_1.Column)({
        name: 'daily_rate',
        type: 'decimal',
        precision: 10,
        scale: 2,
        nullable: true,
    }),
    __metadata("design:type", Number)
], User.prototype, "dailyRate", void 0);
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