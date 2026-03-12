"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.envValidationSchema = void 0;
const Joi = __importStar(require("joi"));
exports.envValidationSchema = Joi.object({
    NODE_ENV: Joi.string()
        .valid('development', 'test', 'production')
        .default('development'),
    PORT: Joi.number().default(3000),
    DATABASE_HOST: Joi.string().required(),
    DATABASE_PORT: Joi.number().default(5432),
    DATABASE_USERNAME: Joi.string().required(),
    DATABASE_PASSWORD: Joi.string().allow('').required(),
    DATABASE_NAME: Joi.string().required(),
    DATABASE_SYNC: Joi.boolean().truthy('true').falsy('false').default(false),
    DATABASE_SSL: Joi.boolean().truthy('true').falsy('false').default(false),
    REDIS_HOST: Joi.string().required(),
    REDIS_PORT: Joi.number().default(6379),
    REDIS_PASSWORD: Joi.string().allow('').optional(),
    REDIS_DB: Joi.number().default(0),
    REDIS_TLS: Joi.boolean().truthy('true').falsy('false').default(false),
    SESSION_SECRET: Joi.string().min(16).required(),
    SESSION_TTL_SECONDS: Joi.number().default(86400),
    R2_ACCOUNT_ID: Joi.string().allow('').optional(),
    R2_ACCESS_KEY_ID: Joi.string().allow('').optional(),
    R2_SECRET_ACCESS_KEY: Joi.string().allow('').optional(),
    R2_BUCKET: Joi.string().allow('').optional(),
    R2_REGION: Joi.string().default('auto'),
    R2_PUBLIC_URL: Joi.string().allow('').optional(),
    CLOUDINARY_CLOUD_NAME: Joi.string().allow('').optional(),
    CLOUDINARY_API_KEY: Joi.string().allow('').optional(),
    CLOUDINARY_API_SECRET: Joi.string().allow('').optional(),
    GEMINI_API_KEY: Joi.string().allow('').optional(),
    GEMINI_MODEL: Joi.string().allow('').optional(),
    FIREBASE_PROJECT_ID: Joi.string().allow('').optional(),
    FIREBASE_CLIENT_EMAIL: Joi.string().allow('').optional(),
    FIREBASE_PRIVATE_KEY: Joi.string().allow('').optional(),
});
//# sourceMappingURL=env.validation.js.map