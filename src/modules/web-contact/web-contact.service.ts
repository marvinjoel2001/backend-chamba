import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WebReportDto, WebSubscribeDto } from './web-contact.dto';

const rowsOf = (result: any): any[] => (Array.isArray(result?.[0]) ? result[0] : result) ?? [];

@Injectable()
export class WebContactService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly realtime: RealtimeGateway,
  ) {}

  async createReport(dto: WebReportDto) {
    const [row] = rowsOf(
      await this.dataSource.query(
        `INSERT INTO web_contact_messages (kind, category, email, message)
         VALUES ('report', $1, $2, $3)
         RETURNING id, created_at`,
        [dto.category, dto.email.trim().toLowerCase(), dto.message.trim()],
      ),
    );
    this.realtime.emitToAdmins('web_contact.new', {
      id: row.id,
      kind: 'report',
      category: dto.category,
      timestamp: row.created_at,
    });
    return { received: true };
  }

  /** Suscribirse dos veces no es error: el correo ya está en la lista. */
  async subscribe(dto: WebSubscribeDto) {
    await this.dataSource.query(
      `INSERT INTO web_contact_messages (kind, email)
       VALUES ('subscribe', $1)
       ON CONFLICT ((LOWER(email))) WHERE kind = 'subscribe' DO NOTHING`,
      [dto.email.trim().toLowerCase()],
    );
    return { subscribed: true };
  }

  async list(kind?: string) {
    const rows = rowsOf(
      await this.dataSource.query(
        `SELECT id, kind, category, email, message, handled_at, created_at
         FROM web_contact_messages
         WHERE ($1::text IS NULL OR kind = $1)
         ORDER BY created_at DESC
         LIMIT 500`,
        [kind === 'report' || kind === 'subscribe' ? kind : null],
      ),
    );
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      category: r.category ?? null,
      email: r.email,
      message: r.message ?? null,
      handledAt: r.handled_at ?? null,
      createdAt: r.created_at,
    }));
  }

  async markHandled(id: string) {
    const rows = rowsOf(
      await this.dataSource.query(
        `UPDATE web_contact_messages SET handled_at = COALESCE(handled_at, NOW())
         WHERE id = $1 RETURNING id, handled_at`,
        [id],
      ),
    );
    if (!rows[0]) throw new NotFoundException('Mensaje no encontrado');
    return { id: rows[0].id, handledAt: rows[0].handled_at };
  }
}
