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
    joinUser(client: Socket, payload: {
        userId?: string;
    }): {
        ok: boolean;
    };
    joinThread(client: Socket, payload: {
        threadId?: string;
    }): {
        ok: boolean;
    };
    broadcastUserCreated(user: {
        id: string;
        email: string;
        firstName: string;
    }): void;
    emitToUser(userId: string, event: string, payload: unknown): void;
    emitToThread(threadId: string, event: string, payload: unknown): void;
    private userRoom;
    private threadRoom;
}
