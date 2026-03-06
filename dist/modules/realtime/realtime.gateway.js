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
exports.RealtimeGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
let RealtimeGateway = class RealtimeGateway {
    server;
    handleConnection(client) {
        client.emit('connection.ready', {
            message: 'Connected to realtime gateway',
            clientId: client.id,
        });
    }
    handleDisconnect(client) {
        client.emit('connection.closed', {
            message: 'Disconnected from realtime gateway',
            clientId: client.id,
        });
    }
    handlePing(client, payload) {
        return {
            event: 'pong',
            data: {
                clientId: client.id,
                payload,
                timestamp: new Date().toISOString(),
            },
        };
    }
    broadcastUserCreated(user) {
        this.server.emit('user.created', {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            timestamp: new Date().toISOString(),
        });
    }
};
exports.RealtimeGateway = RealtimeGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], RealtimeGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('ping'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Object)
], RealtimeGateway.prototype, "handlePing", null);
exports.RealtimeGateway = RealtimeGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: '*',
        },
        namespace: '/realtime',
    })
], RealtimeGateway);
//# sourceMappingURL=realtime.gateway.js.map