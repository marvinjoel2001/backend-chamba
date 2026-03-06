"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaceholdersService = void 0;
const common_1 = require("@nestjs/common");
let PlaceholdersService = class PlaceholdersService {
    listPlannedApiAreas() {
        return [
            {
                area: 'auth',
                status: 'pending',
                notes: 'Firebase Auth OTP with phone number onboarding for workers and clients.',
            },
            {
                area: 'jobs',
                status: 'pending',
                notes: 'Job requests, bids, wave notifications, and negotiation lifecycle.',
            },
            {
                area: 'files',
                status: 'pending',
                notes: 'Upload workflow to Cloudflare R2 and metadata persistence.',
            },
            {
                area: 'tracking',
                status: 'pending',
                notes: 'Live worker location streaming (1 hour before job start) via Socket.io.',
            },
        ];
    }
};
exports.PlaceholdersService = PlaceholdersService;
exports.PlaceholdersService = PlaceholdersService = __decorate([
    (0, common_1.Injectable)()
], PlaceholdersService);
//# sourceMappingURL=placeholders.service.js.map