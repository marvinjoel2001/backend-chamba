import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
export declare class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
    server: Server;
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    handlePing(client: Socket, payload: unknown): {
        event: string;
        data: unknown;
    };
    broadcastUserCreated(user: {
        id: string;
        email: string;
        firstName: string;
    }): void;
}
