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
}
