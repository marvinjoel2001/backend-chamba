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
var StorageService_1;
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let StorageService = StorageService_1 = class StorageService {
    configService;
    logger = new common_1.Logger(StorageService_1.name);
    cloudName;
    apiKey;
    apiSecret;
    enabled;
    constructor(configService) {
        this.configService = configService;
        this.cloudName =
            this.configService.get('CLOUDINARY_CLOUD_NAME', '')?.trim() || '';
        this.apiKey =
            this.configService.get('CLOUDINARY_API_KEY', '')?.trim() || '';
        this.apiSecret =
            this.configService.get('CLOUDINARY_API_SECRET', '')?.trim() || '';
        this.enabled = Boolean(this.cloudName && this.apiKey && this.apiSecret);
        if (!this.enabled) {
            this.logger.warn('Cloudinary disabled: missing CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET.');
        }
    }
    async uploadBase64Image(params) {
        this.ensureConfigured();
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = this.sign({
            folder: params.folder,
            timestamp: String(timestamp),
        });
        const formData = new FormData();
        formData.append('file', params.base64Data);
        formData.append('folder', params.folder);
        formData.append('timestamp', String(timestamp));
        formData.append('api_key', this.apiKey);
        formData.append('signature', signature);
        const response = await fetch(`https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`, {
            method: 'POST',
            body: formData,
        });
        const payload = (await response.json());
        if (!response.ok || !payload.secure_url || !payload.public_id) {
            throw new common_1.ServiceUnavailableException(payload.error?.message || 'Cloudinary upload failed');
        }
        return {
            url: payload.secure_url,
            publicId: payload.public_id,
        };
    }
    async deleteImage(publicId) {
        if (!publicId) {
            return;
        }
        this.ensureConfigured();
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = this.sign({
            public_id: publicId,
            timestamp: String(timestamp),
        });
        const formData = new FormData();
        formData.append('public_id', publicId);
        formData.append('timestamp', String(timestamp));
        formData.append('api_key', this.apiKey);
        formData.append('signature', signature);
        const response = await fetch(`https://api.cloudinary.com/v1_1/${this.cloudName}/image/destroy`, {
            method: 'POST',
            body: formData,
        });
        if (!response.ok) {
            const text = await response.text();
            this.logger.warn(`Cloudinary delete failed: ${text}`);
        }
    }
    ensureConfigured() {
        if (this.enabled) {
            return;
        }
        throw new common_1.ServiceUnavailableException('Cloudinary is not configured in environment variables.');
    }
    sign(params) {
        const toSign = Object.entries(params)
            .filter(([, value]) => value !== undefined && value !== null && value !== '')
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('&');
        return (0, node_crypto_1.createHash)('sha1')
            .update(`${toSign}${this.apiSecret}`)
            .digest('hex');
    }
};
exports.StorageService = StorageService;
exports.StorageService = StorageService = StorageService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _a : Object])
], StorageService);
//# sourceMappingURL=storage.service.js.map