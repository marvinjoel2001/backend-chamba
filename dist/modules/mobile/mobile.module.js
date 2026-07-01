"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MobileModule = void 0;
const common_1 = require("@nestjs/common");
const storage_module_1 = require("../../infrastructure/storage/storage.module");
const notifications_module_1 = require("../notifications/notifications.module");
const realtime_module_1 = require("../realtime/realtime.module");
const queues_module_1 = require("../queues/queues.module");
const api_logs_module_1 = require("../api-logs/api-logs.module");
const mobile_controller_1 = require("./mobile.controller");
const mobile_service_1 = require("./mobile.service");
const mobile_request_repository_1 = require("./shared/mobile-request.repository");
const mobile_geo_helpers_1 = require("./shared/mobile-geo.helpers");
const mobile_catalog_service_1 = require("./services/mobile-catalog.service");
const mobile_chat_service_1 = require("./services/mobile-chat.service");
const mobile_disputes_service_1 = require("./services/mobile-disputes.service");
const mobile_offers_service_1 = require("./services/mobile-offers.service");
const mobile_requests_service_1 = require("./services/mobile-requests.service");
const mobile_users_service_1 = require("./services/mobile-users.service");
const mobile_admin_service_1 = require("./services/mobile-admin.service");
const wave_dispatch_processor_service_1 = require("./services/wave-dispatch.processor.service");
const mobile_requests_cron_service_1 = require("./services/mobile-requests-cron.service");
let MobileModule = class MobileModule {
};
exports.MobileModule = MobileModule;
exports.MobileModule = MobileModule = __decorate([
    (0, common_1.Module)({
        imports: [
            storage_module_1.StorageModule,
            notifications_module_1.NotificationsModule,
            realtime_module_1.RealtimeModule,
            queues_module_1.QueuesModule,
            api_logs_module_1.ApiLogsModule,
        ],
        controllers: [mobile_controller_1.MobileController],
        providers: [
            mobile_service_1.MobileService,
            mobile_request_repository_1.MobileRequestRepository,
            mobile_geo_helpers_1.MobileGeoHelpers,
            mobile_catalog_service_1.MobileCatalogService,
            mobile_chat_service_1.MobileChatService,
            mobile_disputes_service_1.MobileDisputesService,
            mobile_offers_service_1.MobileOffersService,
            mobile_requests_service_1.MobileRequestsService,
            mobile_users_service_1.MobileUsersService,
            mobile_admin_service_1.MobileAdminService,
            wave_dispatch_processor_service_1.WaveDispatchProcessorService,
            mobile_requests_cron_service_1.MobileRequestsCronService,
        ],
        exports: [mobile_service_1.MobileService],
    })
], MobileModule);
//# sourceMappingURL=mobile.module.js.map