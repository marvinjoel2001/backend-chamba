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
exports.PlaceholdersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const placeholders_service_1 = require("./placeholders.service");
class PlannedApiAreaDto {
    area;
    status;
    notes;
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'auth' }),
    __metadata("design:type", String)
], PlannedApiAreaDto.prototype, "area", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'pending' }),
    __metadata("design:type", String)
], PlannedApiAreaDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'Firebase Auth OTP with phone number onboarding for workers and clients.',
    }),
    __metadata("design:type", String)
], PlannedApiAreaDto.prototype, "notes", void 0);
let PlaceholdersController = class PlaceholdersController {
    placeholdersService;
    constructor(placeholdersService) {
        this.placeholdersService = placeholdersService;
    }
    listPlannedApiAreas() {
        return this.placeholdersService.listPlannedApiAreas();
    }
};
exports.PlaceholdersController = PlaceholdersController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Listar áreas API planificadas' }),
    (0, swagger_1.ApiOkResponse)({ type: PlannedApiAreaDto, isArray: true }),
    (0, common_1.Get)('planned-apis'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PlaceholdersController.prototype, "listPlannedApiAreas", null);
exports.PlaceholdersController = PlaceholdersController = __decorate([
    (0, swagger_1.ApiTags)('Placeholders'),
    (0, common_1.Controller)('placeholders'),
    __metadata("design:paramtypes", [placeholders_service_1.PlaceholdersService])
], PlaceholdersController);
//# sourceMappingURL=placeholders.controller.js.map