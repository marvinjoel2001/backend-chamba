import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';

export type Principal = { id: string; kind: 'mobile' | 'admin' | 'agency'; role?: string };

/**
 * true si el token se emitió antes de que se cerraran todas las sesiones del
 * usuario (`users.tokens_valid_after`). `iat` viene en segundos.
 */
export function issuedBeforeRevocation(iat: unknown, validAfter: unknown): boolean {
  if (!validAfter) return false;
  const cutoff = Math.floor(new Date(validAfter as string).getTime() / 1000);
  if (!Number.isFinite(cutoff)) return false;
  return typeof iat !== 'number' || iat < cutoff;
}

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

  /** Token de un solo uso (10 min) para crear una contraseña nueva tras validar Google. */
  issuePasswordReset(userId: string, googleId: string): string {
    return this.jwt.sign({ sub: userId, gid: googleId, kind: 'password-reset' },
      { secret: this.secret, expiresIn: '10m' });
  }

  verifyPasswordReset(token: string): { sub: string; gid: string; iat: number } {
    try {
      const data = this.jwt.verify(token || '', { secret: this.secret, algorithms: ['HS256'] });
      if (data.kind !== 'password-reset' || typeof data.sub !== 'string' || typeof data.gid !== 'string') throw new Error();
      return data;
    } catch { throw new UnauthorizedException('La recuperación venció. Vuelve a empezar con Google.'); }
  }

  /**
   * Comprobante (24 h) de que el backend subió esta foto para este usuario.
   * Solo con él una foto queda como nuestra y se puede borrar después.
   */
  issueUploadTicket(userId: string, publicId: string, url: string): string {
    return this.jwt.sign({ sub: userId, kind: 'upload', pid: publicId, url },
      { secret: this.secret, expiresIn: '1d' });
  }

  /** La foto que subió el backend para este usuario, o null si el comprobante no es suyo o venció. */
  verifyUploadTicket(token: unknown, userId: string): { publicId: string; url: string } | null {
    if (typeof token !== 'string' || !token) return null;
    try {
      const data = this.jwt.verify(token, { secret: this.secret, algorithms: ['HS256'] });
      if (data.kind !== 'upload' || data.sub !== userId
        || typeof data.pid !== 'string' || typeof data.url !== 'string') return null;
      return { publicId: data.pid, url: data.url };
    } catch { return null; }
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
      const rows = await this.db.query(`SELECT type, is_blocked, tokens_valid_after FROM users WHERE id = $1`, [claims.sub]);
      if (!rows[0] || rows[0].is_blocked) throw new UnauthorizedException();
      if (issuedBeforeRevocation(claims.iat, rows[0].tokens_valid_after)) {
        throw new UnauthorizedException('Tu sesión se cerró. Vuelve a iniciar sesión.');
      }
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
    const rows = await this.db.query(`SELECT t.id FROM chat_threads t
      JOIN job_requests jr ON jr.id = t.request_id AND jr.client_user_id = t.client_user_id
      WHERE t.id = $1 AND (t.client_user_id = $2 OR t.worker_user_id = $2)
      AND jr.status IN ('assigned', 'in_progress', 'completed', 'cancelled')
      AND EXISTS (SELECT 1 FROM job_offers jo WHERE jo.request_id = t.request_id
        AND jo.worker_user_id = t.worker_user_id AND jo.status = 'accepted')`, [threadId, userId]);
    if (!rows[0]) throw new ForbiddenException('No perteneces a esta conversación');
  }

  async assertVerifiedWorker(userId: string): Promise<void> {
    const rows = await this.db.query(
      `SELECT id FROM users WHERE id = $1 AND type = 'worker'
       AND verification_status = 'verified' AND is_blocked = false`, [userId]);
    if (!rows[0]) throw new ForbiddenException('Verifica tu identidad para empezar a trabajar');
  }

  async assertRequest(userId: string, requestId: string): Promise<void> {
    const rows = await this.db.query(`SELECT jr.id FROM job_requests jr WHERE jr.id = $1
      AND (jr.client_user_id = $2 OR EXISTS (SELECT 1 FROM job_offers jo
        WHERE jo.request_id = jr.id AND jo.worker_user_id = $2 AND jo.status = 'accepted'))`, [requestId, userId]);
    if (!rows[0]) throw new ForbiddenException('No perteneces a este trabajo');
  }

  async notificationRequest(userId: string, requestId: string) {
    const rows = await this.db.query(`SELECT jr.id, jr.title, jr.description, jr.category, jr.address,
      jr.status, jr.budget, jr.created_at, jr.completed_at, jr.modality, jo.status AS offer_status,
      jr.estimated_hours, jr.hourly_rate, jr.days, jr.daily_rate, jr.payment_method,
      ST_Y(jr.location::geometry) AS latitude, ST_X(jr.location::geometry) AS longitude,
      COALESCE(jr.settled_amount, jo.amount, jr.budget) AS amount,
      w.id AS worker_id, w.first_name AS worker_first_name, w.last_name AS worker_last_name,
      w.profile_photo_url AS worker_photo, c.id AS client_id, c.first_name AS client_first_name,
      c.last_name AS client_last_name, c.profile_photo_url AS client_photo, ct.id AS thread_id,
      (SELECT p.url FROM job_request_photos p WHERE p.request_id = jr.id ORDER BY p.created_at LIMIT 1) AS photo_url,
      EXISTS (SELECT 1 FROM worker_reviews r WHERE r.request_id = jr.id) AS reviewed
      FROM job_requests jr
      JOIN users c ON c.id = jr.client_user_id
      LEFT JOIN job_offers jo ON jo.request_id = jr.id AND jo.status = 'accepted'
      LEFT JOIN users w ON w.id = jo.worker_user_id
      LEFT JOIN chat_threads ct ON ct.request_id = jr.id AND ct.worker_user_id = w.id AND ct.client_user_id = c.id
      WHERE jr.id = $1 AND (
      jr.client_user_id = $2 OR EXISTS (SELECT 1 FROM job_offers jo WHERE jo.request_id = jr.id AND jo.worker_user_id = $2)
      OR EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = $2 AND (n.data->>'requestId' = jr.id::text OR n.data->>'jobId' = jr.id::text)))`, [requestId, userId]);
    if (!rows[0]) throw new ForbiddenException('No perteneces a esta solicitud');
    const row = rows[0];
    return { request: { id: row.id, requestId: row.id, title: row.title, description: row.description,
      category: row.category, address: row.address, requestStatus: row.status, amount: Number(row.amount),
      modality: row.modality, offerStatus: row.offer_status ?? null,
      budget: Number(row.budget),
      estimatedHours: row.estimated_hours == null ? null : Number(row.estimated_hours),
      hourlyRate: row.hourly_rate == null ? null : Number(row.hourly_rate),
      days: row.days == null ? null : Number(row.days),
      dailyRate: row.daily_rate == null ? null : Number(row.daily_rate),
      paymentMethod: row.payment_method ?? null,
      latitude: row.latitude == null ? null : Number(row.latitude),
      longitude: row.longitude == null ? null : Number(row.longitude),
      threadId: row.thread_id ?? null, photoUrl: row.photo_url ?? null,
      // La app abre "Calificar" desde el push de trabajo terminado si aún no se calificó.
      reviewed: row.reviewed === true,
      worker: row.worker_id ? { id: row.worker_id, firstName: row.worker_first_name,
        lastName: row.worker_last_name ?? '', profilePhotoUrl: row.worker_photo ?? null } : null,
      client: { id: row.client_id, firstName: row.client_first_name,
        lastName: row.client_last_name ?? '', profilePhotoUrl: row.client_photo ?? null },
      createdAt: row.created_at, completedAt: row.completed_at } };
  }

  async assertDispute(userId: string, disputeId: string): Promise<void> {
    // Las dos partes de la queja entran al chat de soporte; al reportado se le avisa para que responda.
    const rows = await this.db.query(`SELECT id FROM disputes WHERE id = $1 AND (reported_by = $2 OR reported_user = $2)`, [disputeId, userId]);
    if (!rows[0]) throw new ForbiddenException('No perteneces a esta conversación de soporte');
  }
}
