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
var DatabaseBootstrapService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseBootstrapService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
let DatabaseBootstrapService = DatabaseBootstrapService_1 = class DatabaseBootstrapService {
    dataSource;
    logger = new common_1.Logger(DatabaseBootstrapService_1.name);
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async onModuleInit() {
        await this.ensurePostgis();
    }
    async ensurePostgis() {
        await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS postgis;');
        const [result] = await this.dataSource.query('SELECT postgis_version();');
        this.logger.log(`PostGIS ready: ${result.postgis_version}`);
    }
};
exports.DatabaseBootstrapService = DatabaseBootstrapService;
exports.DatabaseBootstrapService = DatabaseBootstrapService = DatabaseBootstrapService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], DatabaseBootstrapService);
//# sourceMappingURL=database.bootstrap.service.js.map