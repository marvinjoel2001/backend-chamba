import { ConnectedSocket, MessageBody, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect,
  SubscribeMessage, WebSocketGateway, WebSocketServer, WsException } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DataSource } from 'typeorm';
import { AccessService, Principal } from '../access/access.service';
const AGENCY_EVENTS = new Set(['offer.new', 'offer.accepted', 'offer.rejected', 'offer.updated', 'offer.expired', 'job.cancelled', 'job.completed']);

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/realtime' })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  constructor(private readonly access: AccessService, private readonly db: DataSource) {}
  afterInit(server: Server): void {
    server.use(async (client, next) => {
      try { client.data.principal = await this.access.authenticate(client.handshake.auth?.token); next(); }
      catch { next(new Error('unauthorized')); }
    });
  }
  handleConnection(client: Socket): void {
    const principal = client.data.principal as Principal;
    if (!principal) { client.disconnect(true); return; }
    if (principal.kind === 'mobile') client.join('user:' + principal.id);
    if (principal.kind === 'admin') client.join('admins');
    if (principal.kind === 'agency') client.join('agencies');
    client.data.visible = false;
    client.emit('connection.ready', { clientId: client.id });
    client.data.authTimer = setInterval(async () => {
      try {
        await this.access.authenticate(client.handshake.auth?.token);
        if (principal.kind === 'agency') {
          for (const room of client.rooms) {
            if (room.startsWith('agency-worker:') && !await this.access.canJoinUser(principal, room.substring(14))) await client.leave(room);
          }
        }
      }
      catch { client.disconnect(true); }
    }, 60000);
  }
  handleDisconnect(client: Socket): void { clearInterval(client.data.authTimer); }
  @SubscribeMessage('join.user')
  async joinUser(@ConnectedSocket() client: Socket, @MessageBody() payload: { userId?: string }) {
    const principal = client.data.principal as Principal;
    if (!payload?.userId || !await this.access.canJoinUser(principal, payload.userId)) throw new WsException('Forbidden');
    await client.join((principal.kind === 'agency' ? 'agency-worker:' : 'user:') + payload.userId);
    return { ok: true };
  }
  @SubscribeMessage('join.thread')
  async joinThread(@ConnectedSocket() client: Socket, @MessageBody() payload: { threadId?: string }) {
    const principal = client.data.principal as Principal;
    if (principal.kind !== 'mobile' || !payload?.threadId) throw new WsException('Forbidden');
    await this.access.assertThread(principal.id, payload.threadId);
    await client.join('thread:' + payload.threadId);
    return { ok: true };
  }
  @SubscribeMessage('leave.thread')
  async leaveThread(@ConnectedSocket() client: Socket, @MessageBody() payload: { threadId?: string }) {
    if (payload?.threadId) await client.leave('thread:' + payload.threadId);
    return { ok: true };
  }
  @SubscribeMessage('presence.update')
  async presence(@ConnectedSocket() client: Socket, @MessageBody() payload: { visible?: boolean; token?: string }) {
    const principal = client.data.principal as Principal;
    if (principal.kind !== 'mobile') return { ok: false };
    const rows = payload?.token ? await this.db.query('SELECT token FROM push_tokens WHERE user_id = $1 AND token = $2',
      [principal.id, payload.token]) : [];
    client.data.pushToken = rows[0]?.token;
    client.data.visible = payload?.visible === true;
    client.data.presenceAt = Date.now();
    return { ok: true };
  }
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket, @MessageBody() payload: unknown) {
    return { event: 'pong', data: { clientId: client.id, payload, timestamp: new Date().toISOString() } };
  }
  async presentNotification(userId: string, payload: unknown): Promise<Set<string>> {
    const tokens = new Set<string>();
    const clients = await this.server.in('user:' + userId).fetchSockets();
    await Promise.all(clients.map(async (client) => {
      if (!client.data.visible || Date.now() - (client.data.presenceAt || 0) > 45000 || !client.data.pushToken) return;
      try {
        const ack = await client.timeout(1200).emitWithAck('notification.new', payload);
        if (ack?.displayed === true) tokens.add(client.data.pushToken);
      } catch { /* FCM fallback on missing acknowledgement. */ }
    }));
    return tokens;
  }
  broadcastUserCreated(user: { id: string; email: string; firstName: string }): void {
    this.emitToAdmins('user.created', { ...user, timestamp: new Date().toISOString() });
  }
  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server.to('user:' + userId).emit(event, payload);
    if (AGENCY_EVENTS.has(event)) this.server.to('agency-worker:' + userId).emit(event, payload);
  }
  emitToThread(threadId: string, event: string, payload: unknown): void { this.server.to('thread:' + threadId).emit(event, payload); }
  emitToAdmins(event: string, payload: unknown): void { this.server.to('admins').emit(event, payload); }
  broadcastToAll(event: string, payload: unknown): void { this.emitToAdmins(event, payload); }
  broadcastRequest(event: string, payload: unknown): void { this.server.to('admins').to('agencies').emit(event, payload); }
  broadcastClientLocationUpdated(clientId: string, latitude: number, longitude: number, timestamp: string): void {
    this.emitToAdmins('client.location.updated', { clientId, latitude, longitude, timestamp });
  }
  broadcastClientStatusChanged(clientId: string, isActive: boolean, timestamp: string): void {
    this.emitToAdmins('client.status.changed', { clientId, isActive, timestamp });
  }
}
