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
exports.StorageService = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let StorageService = class StorageService {
    configService;
    bucketName;
    publicUrl;
    client;
    constructor(configService) {
        this.configService = configService;
        const accountId = this.configService.getOrThrow('R2_ACCOUNT_ID');
        const region = this.configService.get('R2_REGION', 'auto');
        this.bucketName = this.configService.getOrThrow('R2_BUCKET');
        this.publicUrl = this.configService.get('R2_PUBLIC_URL');
        this.client = new client_s3_1.S3Client({
            region,
            endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: this.configService.getOrThrow('R2_ACCESS_KEY_ID'),
                secretAccessKey: this.configService.getOrThrow('R2_SECRET_ACCESS_KEY'),
            },
        });
    }
    async uploadBuffer(params) {
        const command = new client_s3_1.PutObjectCommand({
            Bucket: this.bucketName,
            Key: params.key,
            Body: params.body,
            ContentType: params.contentType,
        });
        await this.client.send(command);
    }
    getPublicFileUrl(key) {
        if (!this.publicUrl) {
            return null;
        }
        return `${this.publicUrl.replace(/\/$/, '')}/${key}`;
    }
};
exports.StorageService = StorageService;
exports.StorageService = StorageService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], StorageService);
//# sourceMappingURL=storage.service.js.map