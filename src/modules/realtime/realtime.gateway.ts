import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/realtime',
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket): void {
    const userId = client.handshake.query['userId'];
    if (typeof userId === 'string' && userId.trim().length > 0) {
      client.join(this.userRoom(userId));
    }

    client.emit('connection.ready', {
      message: 'Connected to realtime gateway',
      clientId: client.id,
    });
  }

  handleDisconnect(client: Socket): void {
    client.emit('connection.closed', {
      message: 'Disconnected from realtime gateway',
      clientId: client.id,
    });
  }

  @SubscribeMessage('ping')
  handlePing(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): { event: string; data: unknown } {
    return {
      event: 'pong',
      data: {
        clientId: client.id,
        payload,
        timestamp: new Date().toISOString(),
      },
    };
  }

  @SubscribeMessage('join.user')
  joinUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { userId?: string },
  ): { ok: boolean } {
    const userId = payload?.userId?.trim();
    if (userId) {
      client.join(this.userRoom(userId));
    }
    return { ok: true };
  }

  @SubscribeMessage('join.thread')
  joinThread(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { threadId?: string },
  ): { ok: boolean } {
    const threadId = payload?.threadId?.trim();
    if (threadId) {
      client.join(this.threadRoom(threadId));
    }
    return { ok: true };
  }

  broadcastUserCreated(user: {
    id: string;
    email: string;
    firstName: string;
  }): void {
    this.server.emit('user.created', {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      timestamp: new Date().toISOString(),
    });
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server.to(this.userRoom(userId)).emit(event, payload);
  }

  emitToThread(threadId: string, event: string, payload: unknown): void {
    this.server.to(this.threadRoom(threadId)).emit(event, payload);
  }

  private userRoom(userId: string): string {
    return `user:${userId}`;
  }

  private threadRoom(threadId: string): string {
    return `thread:${threadId}`;
  }
}
