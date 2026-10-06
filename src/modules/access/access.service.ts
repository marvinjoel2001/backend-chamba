import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';

export type Principal = { id: string; kind: 'mobile' | 'admin' | 'agency'; role?: string };

@Injectable()
export class AccessService {
  constructor(private readonly jwt: JwtService, private readonly config: ConfigService,
    private readonly db: DataSource) {}

  private get secret(): string {
    return this.config.get<string>('JWT_SECRET') || this.config.getOrThrow<string>('SESSION_SECRET');
  }

  issueMobile(id: string, role: string): string {
    return this.jwt.sign({ sub: id, kind: 'mobile', role }, { secret: this.secret, expiresIn: '30d' });
  }

  issueGoogleRegistration(data: Record<string, unknown>): string {
    return this.jwt.sign({ ...data, kind: 'google-registration' }, { secret: this.secret, expiresIn: '10m' });
  }

  verifyGoogleRegistration(token: string): any {
    try {
      const data = this.jwt.verify(token, { secret: this.secret, algorithms: ['HS256'] });
      if (data.kind !== 'google-registration') throw new Error();
      return data;
    } catch { throw new UnauthorizedException('Registro de Google inválido o expirado'); }
  }

  async authenticate(token?: string): Promise<Principal> {
    let claims: any;
    try { claims = this.jwt.verify(token || '', { secret: this.secret, algorithms: ['HS256'] }); }
    catch { throw new UnauthorizedException('Sesión inválida o expirada'); }
    if (typeof claims.sub !== 'string') throw new UnauthorizedException();
    if (claims.kind === 'mobile') {
      const rows = await this.db.query(`SELECT type, is_blocked FROM users WHERE id = $1`, [claims.sub]);
      if (!rows[0] || rows[0].is_blocked) throw new UnauthorizedException();
      return { id: claims.sub, kind: 'mobile', role: rows[0].type };
    }
    if (claims.type === 'agency') {
      const rows = await this.db.query(`SELECT id FROM agencies WHERE id = $1 AND is_active = true`, [claims.sub]);
      if (!rows[0]) throw new UnauthorizedException();
      return { id: claims.sub, kind: 'agency' };
    }
    if (typeof claims.username === 'string') {
      const rows = await this.db.query(`SELECT id FROM admin_users WHERE id = $1`, [claims.sub]);
      if (rows[0]) return { id: claims.sub, kind: 'admin' };
    }
    throw new UnauthorizedException();
  }

  async canJoinUser(principal: Principal, userId: string): Promise<boolean> {
    if (principal.kind === 'mobile') return principal.id === userId;
    if (principal.kind !== 'agency') return false;
    const rows = await this.db.query(`SELECT id FROM users WHERE id = $1 AND agency_id = $2`, [userId, principal.id]);
    return rows.length > 0;
  }

  async assertThread(userId: string, threadId: string): Promise<void> {
    const rows = await this.db.query(`SELECT id FROM chat_threads WHERE id = $1
      AND (client_user_id = $2 OR worker_user_id = $2)`, [threadId, userId]);
    if (!rows[0]) throw new ForbiddenException('No perteneces a esta conversación');
  }

  async assertRequest(userId: string, requestId: string): Promise<void> {
    const rows = await this.db.query(`SELECT jr.id FROM job_requests jr WHERE jr.id = $1
      AND (jr.client_user_id = $2 OR EXISTS (SELECT 1 FROM job_offers jo
        WHERE jo.request_id = jr.id AND jo.worker_user_id = $2 AND jo.status = 'accepted'))`, [requestId, userId]);
    if (!rows[0]) throw new ForbiddenException('No perteneces a este trabajo');
  }

  async notificationRequest(userId: string, requestId: string) {
    const rows = await this.db.query(`SELECT jr.id, jr.title, jr.description, jr.category, jr.address,
      jr.status, jr.budget, jr.created_at, jr.completed_at FROM job_requests jr WHERE jr.id = $1 AND (
      jr.client_user_id = $2 OR EXISTS (SELECT 1 FROM job_offers jo WHERE jo.request_id = jr.id AND jo.worker_user_id = $2)
      OR EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = $2 AND (n.data->>'requestId' = jr.id::text OR n.data->>'jobId' = jr.id::text)))`, [requestId, userId]);
    if (!rows[0]) throw new ForbiddenException('No perteneces a esta solicitud');
    const row = rows[0];
    return { request: { id: row.id, requestId: row.id, title: row.title, description: row.description,
      category: row.category, address: row.address, requestStatus: row.status, amount: Number(row.budget),
      createdAt: row.created_at, completedAt: row.completed_at } };
  }

  async assertDispute(userId: string, disputeId: string): Promise<void> {
    const rows = await this.db.query(`SELECT id FROM disputes WHERE id = $1 AND reported_by = $2`, [disputeId, userId]);
    if (!rows[0]) throw new ForbiddenException('No perteneces a esta conversación de soporte');
  }
}
