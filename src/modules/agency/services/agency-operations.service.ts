import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../../notifications/notifications.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';

const rowsOf = (raw: any): any[] =>
  Array.isArray(raw?.[0]) ? raw[0] : Array.isArray(raw) ? raw : [];

const round2 = (value: number) => Math.round(value * 100) / 100;

const validRate = (value: unknown, label: string): number => {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new BadRequestException(`${label} debe estar entre 0 y 100.`);
  }
  return round2(rate);
};

/** Contraseña fácil de dictar por teléfono: "chamba-4821-kq". */
export function generateWorkerPassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const pick = () => letters[randomInt(letters.length)];
  return `chamba-${randomInt(1000, 10000)}-${pick()}${pick()}`;
}

/** Montos de un trabajo completado, tal como quedaron congelados. */
export interface LedgerJob {
  requestId: string;
  title: string;
  workerId: string;
  workerName: string;
  completedAt: string | null;
  amount: number;
  isDigital: boolean;
  workerRate: number;
  chambaRate: number;
  /** Lo que se queda la agencia (amount × workerRate). */
  agencyCut: number;
  /** Lo que le toca al trabajador (amount − agencyCut). */
  workerShare: number;
  /** Comisión de Chamba (amount × chambaRate). */
  chambaFee: number;
}

/**
 * Operación diaria de una agencia: su flota (crear cuentas, restablecer
 * contraseñas, comisión por trabajador), avisos con push, pagos a sus
 * trabajadores y la cuenta corriente con Chamba.
 */
@Injectable()
export class AgencyOperationsService {
  private readonly logger = new Logger(AgencyOperationsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  // ───────────────────────────────────────────────────────── ajustes

  async getSettings(agencyId: string) {
    const agency = rowsOf(
      await this.dataSource.query(
        `SELECT id, name, contact_email, contact_phone, tax_id,
                commission_rate, worker_commission_rate
         FROM agencies WHERE id = $1`,
        [agencyId],
      ),
    )[0];
    if (!agency) throw new NotFoundException('Agencia no encontrada');
    return {
      id: agency.id,
      name: agency.name,
      contactEmail: agency.contact_email,
      contactPhone: agency.contact_phone ?? null,
      taxId: agency.tax_id ?? null,
      chambaCommissionRate: Number(agency.commission_rate ?? 0),
      workerCommissionRate: Number(agency.worker_commission_rate ?? 0),
    };
  }

  async updateSettings(agencyId: string, dto: { workerCommissionRate?: number }) {
    if (dto.workerCommissionRate !== undefined) {
      await this.dataSource.query(
        `UPDATE agencies SET worker_commission_rate = $2, updated_at = NOW() WHERE id = $1`,
        [agencyId, validRate(dto.workerCommissionRate, 'La comisión')],
      );
    }
    return this.getSettings(agencyId);
  }

  // ─────────────────────────────────────────────────────────── flota

  private async assertOwnWorker(agencyId: string, workerUserId: string) {
    const worker = rowsOf(
      await this.dataSource.query(
        `SELECT id, first_name, last_name, email, phone FROM users
         WHERE id = $1 AND agency_id = $2 AND is_agency_worker = true AND type = 'worker'`,
        [workerUserId, agencyId],
      ),
    )[0];
    if (!worker) throw new NotFoundException('El trabajador no pertenece a tu agencia');
    return worker;
  }

  /**
   * La agencia da de alta a su trabajador: la cuenta queda vinculada a la
   * agencia (no recibe trabajos de Chamba) y la contraseña se muestra una vez.
   */
  async createWorker(
    agencyId: string,
    dto: {
      firstName: string;
      lastName?: string;
      email: string;
      phone?: string;
      password?: string;
      skills?: string[];
      commissionRate?: number | null;
    },
  ) {
    const firstName = dto.firstName?.trim();
    const email = dto.email?.trim().toLowerCase();
    if (!firstName) throw new BadRequestException('El nombre es obligatorio.');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Escribe un correo válido: será su usuario para entrar a la app.');
    }
    const phone = dto.phone?.replace(/[^0-9]/g, '') || null;
    if (phone && !/^\d{7,15}$/.test(phone)) {
      throw new BadRequestException('El teléfono debe tener entre 7 y 15 dígitos.');
    }
    const password = dto.password?.trim() || generateWorkerPassword();
    if (password.length < 8) {
      throw new BadRequestException('La contraseña debe tener al menos 8 caracteres.');
    }
    const rate =
      dto.commissionRate === undefined || dto.commissionRate === null
        ? null
        : validRate(dto.commissionRate, 'La comisión');
    const skills = [...new Set((dto.skills ?? []).map((s) => s.trim()).filter(Boolean))].slice(0, 12);

    const created = await this.dataSource.transaction(async (manager) => {
      const existing = await manager.query(
        `SELECT id FROM users
         WHERE LOWER(email) = $1
            OR ($2::text IS NOT NULL AND regexp_replace(COALESCE(phone, ''), '[^0-9]+', '', 'g') = $2)
         LIMIT 1`,
        [email, phone],
      );
      if (rowsOf(existing)[0]) {
        throw new ConflictException(
          'Ese correo o teléfono ya tiene una cuenta. Si es tu trabajador, usa "Vincular cuenta existente".',
        );
      }
      const user = rowsOf(
        await manager.query(
          `INSERT INTO users (type, email, phone, first_name, last_name, is_available,
                              agency_id, is_agency_worker)
           VALUES ('worker', $1, $2, $3, $4, false, $5, true)
           RETURNING id`,
          [email, phone, firstName, dto.lastName?.trim() || null, agencyId],
        ),
      )[0];
      await manager.query(
        `INSERT INTO auth_credentials (user_id, password) VALUES ($1, $2)`,
        [user.id, await bcrypt.hash(password, 12)],
      );
      for (const skill of skills) {
        await manager.query(
          `INSERT INTO worker_skills (user_id, skill) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [user.id, skill],
        );
      }
      if (rate !== null) {
        await manager.query(
          `INSERT INTO agency_worker_terms (worker_user_id, agency_id, commission_rate)
           VALUES ($1, $2, $3)`,
          [user.id, agencyId, rate],
        );
      }
      return user;
    });

    this.logger.log(`[createWorker] Agencia ${agencyId} creó al trabajador ${created.id}`);
    return { workerId: created.id, email, phone, password };
  }

  /** Nueva contraseña para el trabajador; se muestra una sola vez. */
  async resetWorkerPassword(agencyId: string, workerUserId: string) {
    const worker = await this.assertOwnWorker(agencyId, workerUserId);
    const password = generateWorkerPassword();
    await this.dataSource.query(
      `INSERT INTO auth_credentials (user_id, password) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET password = EXCLUDED.password`,
      [workerUserId, await bcrypt.hash(password, 12)],
    );
    this.logger.log(`[resetWorkerPassword] Agencia ${agencyId} restableció la clave de ${workerUserId}`);
    return { workerId: workerUserId, email: worker.email, phone: worker.phone ?? null, password };
  }

  /** Comisión propia de un trabajador; null = usa la general de la agencia. */
  async setWorkerCommission(agencyId: string, workerUserId: string, value: number | null) {
    await this.assertOwnWorker(agencyId, workerUserId);
    if (value === null || value === undefined || (value as unknown) === '') {
      await this.dataSource.query(`DELETE FROM agency_worker_terms WHERE worker_user_id = $1`, [workerUserId]);
      return { workerId: workerUserId, commissionRate: null };
    }
    const rate = validRate(value, 'La comisión');
    await this.dataSource.query(
      `INSERT INTO agency_worker_terms (worker_user_id, agency_id, commission_rate, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (worker_user_id) DO UPDATE
         SET agency_id = EXCLUDED.agency_id, commission_rate = EXCLUDED.commission_rate, updated_at = NOW()`,
      [workerUserId, agencyId, rate],
    );
    return { workerId: workerUserId, commissionRate: rate };
  }

  /** Comisión propia de cada trabajador (para la lista de la flota). */
  async workerTerms(agencyId: string): Promise<Map<string, number | null>> {
    const rows = rowsOf(
      await this.dataSource.query(
        `SELECT worker_user_id, commission_rate FROM agency_worker_terms WHERE agency_id = $1`,
        [agencyId],
      ),
    );
    return new Map(
      rows.map((r) => [r.worker_user_id, r.commission_rate == null ? null : Number(r.commission_rate)]),
    );
  }

  // ─────────────────────────────────────────────────────────── avisos

  async sendMessage(
    agencyId: string,
    dto: { title: string; body: string; workerIds?: string[] | 'all' },
  ) {
    const title = dto.title?.trim() ?? '';
    const body = dto.body?.trim() ?? '';
    if (!title || !body) throw new BadRequestException('Escribe un título y un mensaje.');
    if (title.length > 80) throw new BadRequestException('El título admite hasta 80 caracteres.');
    if (body.length > 500) throw new BadRequestException('El mensaje admite hasta 500 caracteres.');
    const everyone = dto.workerIds === 'all' || dto.workerIds === undefined;
    const requested = Array.isArray(dto.workerIds) ? dto.workerIds : [];
    if (!everyone && requested.length === 0) {
      throw new BadRequestException('Elige al menos un trabajador.');
    }

    const agency = rowsOf(
      await this.dataSource.query(`SELECT name FROM agencies WHERE id = $1`, [agencyId]),
    )[0];
    const campaignId = randomUUID();
    const data = { type: 'announcement', campaignId, title, body, agencyId, agencyName: agency?.name ?? '' };

    // Solo trabajadores propios y no bloqueados: un id ajeno se ignora.
    const recipients = rowsOf(
      await this.dataSource.query(
        `INSERT INTO notifications (user_id, title, body, type, data)
         SELECT u.id, $3, $4, 'announcement', $5::jsonb
         FROM users u
         WHERE u.agency_id = $1 AND u.is_agency_worker = true AND u.type = 'worker'
           AND COALESCE(u.is_blocked, false) = false
           AND ($2::uuid[] IS NULL OR u.id = ANY($2::uuid[]))
         RETURNING user_id AS id`,
        [agencyId, everyone ? null : requested, title, body, JSON.stringify(data)],
      ),
    ).map((r) => r.id as string);

    if (recipients.length === 0) {
      throw new BadRequestException('Ninguno de los trabajadores elegidos puede recibir avisos.');
    }
    for (const id of recipients) {
      this.realtime.emitToUser(id, 'notifications.changed', { eventId: campaignId });
    }
    const tokens = rowsOf(
      await this.dataSource.query(
        `SELECT DISTINCT token FROM push_tokens WHERE user_id = ANY($1::uuid[]) AND token IS NOT NULL`,
        [recipients],
      ),
    ).map((r) => r.token as string);
    const pushed = await this.notifications
      .broadcastPush({ tokens, title: `${agency?.name ?? 'Tu agencia'}: ${title}`, body })
      .catch((error: Error) => {
        this.logger.warn(`Push de aviso ${campaignId} falló: ${error.message}`);
        return 0;
      });

    const saved = rowsOf(
      await this.dataSource.query(
        `INSERT INTO agency_messages (agency_id, title, body, worker_ids, recipients, pushed)
         VALUES ($1, $2, $3, $4::uuid[], $5, $6)
         RETURNING id, created_at`,
        [agencyId, title, body, recipients, recipients.length, pushed],
      ),
    )[0];
    return {
      id: saved.id,
      title,
      body,
      recipients: recipients.length,
      pushed,
      createdAt: saved.created_at,
    };
  }

  async listMessages(agencyId: string) {
    const rows = rowsOf(
      await this.dataSource.query(
        `SELECT m.id, m.title, m.body, m.recipients, m.pushed, m.created_at
         FROM agency_messages m WHERE m.agency_id = $1
         ORDER BY m.created_at DESC LIMIT 50`,
        [agencyId],
      ),
    );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      recipients: Number(r.recipients),
      pushed: Number(r.pushed),
      createdAt: r.created_at,
    }));
  }

  // ─────────────────────────────────────────── libro de trabajos completados

  /**
   * Registra en el libro los trabajos completados que aún no están, con las
   * comisiones vigentes en ese momento. Así cambiar una comisión después no
   * reescribe cuentas pasadas.
   */
  async syncLedger(agencyId: string): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO agency_job_ledger (request_id, agency_id, worker_user_id, amount,
                                      worker_rate, chamba_rate, is_digital, completed_at)
       SELECT jr.id, a.id, jo.worker_user_id,
              COALESCE(jr.settled_amount, jo.amount),
              COALESCE(t.commission_rate, a.worker_commission_rate, 0),
              COALESCE(a.commission_rate, 0),
              (EXISTS (SELECT 1 FROM payments p WHERE p.request_id = jr.id AND p.status = 'paid')
               OR LOWER(COALESCE(jr.payment_method_code, '')) = 'card'
               OR LOWER(COALESCE(jr.payment_method, '')) = 'tarjeta'),
              jr.completed_at
       FROM job_offers jo
       JOIN job_requests jr ON jr.id = jo.request_id
       JOIN agencies a ON a.id = jo.offered_by_agency_id
       LEFT JOIN agency_worker_terms t ON t.worker_user_id = jo.worker_user_id AND t.agency_id = a.id
       WHERE jo.offered_by_agency_id = $1
         AND jo.status = 'accepted'
         AND jr.status = 'completed'
       ON CONFLICT (request_id) DO NOTHING`,
      [agencyId],
    );
  }

  async ledgerJobs(agencyId: string, workerId?: string): Promise<LedgerJob[]> {
    await this.syncLedger(agencyId);
    const rows = rowsOf(
      await this.dataSource.query(
        `SELECT l.request_id, jr.title, l.worker_user_id, l.completed_at, l.amount,
                l.is_digital, l.worker_rate, l.chamba_rate,
                TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS worker_name
         FROM agency_job_ledger l
         JOIN job_requests jr ON jr.id = l.request_id
         LEFT JOIN users u ON u.id = l.worker_user_id
         WHERE l.agency_id = $1 AND ($2::uuid IS NULL OR l.worker_user_id = $2)
         ORDER BY l.completed_at DESC NULLS LAST`,
        [agencyId, workerId ?? null],
      ),
    );
    return rows.map((r) => {
      const amount = Number(r.amount);
      const workerRate = Number(r.worker_rate);
      const chambaRate = Number(r.chamba_rate);
      const agencyCut = round2((amount * workerRate) / 100);
      return {
        requestId: r.request_id,
        title: r.title,
        workerId: r.worker_user_id,
        workerName: r.worker_name || 'Trabajador',
        completedAt: r.completed_at,
        amount,
        isDigital: r.is_digital === true,
        workerRate,
        chambaRate,
        agencyCut,
        workerShare: round2(amount - agencyCut),
        chambaFee: round2((amount * chambaRate) / 100),
      };
    });
  }

  // ─────────────────────────────────────────────── pagos a trabajadores

  /**
   * Por trabajador: lo que le toca de sus trabajos completados, lo que ya se
   * le pagó (o cobró él en efectivo) y el saldo. Saldo > 0: la agencia le debe.
   */
  async getPayouts(agencyId: string) {
    const [jobs, payouts, workers, terms] = await Promise.all([
      this.ledgerJobs(agencyId),
      this.dataSource.query(
        `SELECT p.id, p.worker_user_id, p.amount, p.kind, p.note, p.paid_at,
                TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS worker_name
         FROM agency_payouts p
         LEFT JOIN users u ON u.id = p.worker_user_id
         WHERE p.agency_id = $1
         ORDER BY p.paid_at DESC`,
        [agencyId],
      ),
      this.dataSource.query(
        `SELECT id, TRIM(CONCAT(first_name, ' ', COALESCE(last_name, ''))) AS name,
                profile_photo_url, phone
         FROM users WHERE agency_id = $1 AND is_agency_worker = true AND type = 'worker'
         ORDER BY first_name`,
        [agencyId],
      ),
      this.workerTerms(agencyId),
    ]);
    const history = rowsOf(payouts).map((p) => ({
      id: p.id,
      workerId: p.worker_user_id,
      workerName: p.worker_name || 'Trabajador',
      amount: Number(p.amount),
      kind: p.kind as 'paid' | 'kept_cash',
      note: p.note ?? null,
      paidAt: p.paid_at,
    }));

    const byWorker = new Map<string, any>();
    const entry = (id: string, name: string) => {
      if (!byWorker.has(id)) {
        byWorker.set(id, {
          workerId: id,
          workerName: name,
          profilePhotoUrl: null,
          phone: null,
          commissionRate: terms.get(id) ?? null,
          jobsCount: 0,
          generated: 0,
          agencyCut: 0,
          earned: 0,
          paid: 0,
          balance: 0,
          lastPaidAt: null as string | null,
        });
      }
      return byWorker.get(id);
    };
    for (const w of rowsOf(workers)) {
      Object.assign(entry(w.id, w.name), { profilePhotoUrl: w.profile_photo_url ?? null, phone: w.phone ?? null });
    }
    for (const job of jobs) {
      const e = entry(job.workerId, job.workerName);
      e.jobsCount += 1;
      e.generated = round2(e.generated + job.amount);
      e.agencyCut = round2(e.agencyCut + job.agencyCut);
      e.earned = round2(e.earned + job.workerShare);
    }
    for (const p of history) {
      const e = entry(p.workerId, p.workerName);
      e.paid = round2(e.paid + p.amount);
      if (!e.lastPaidAt || new Date(p.paidAt) > new Date(e.lastPaidAt)) e.lastPaidAt = p.paidAt;
    }
    const balances = [...byWorker.values()].map((e) => ({ ...e, balance: round2(e.earned - e.paid) }));
    balances.sort((a, b) => b.balance - a.balance || a.workerName.localeCompare(b.workerName));

    return {
      summary: {
        owedToWorkers: round2(balances.reduce((s, b) => s + Math.max(b.balance, 0), 0)),
        owedByWorkers: round2(balances.reduce((s, b) => s + Math.max(-b.balance, 0), 0)),
        paidTotal: round2(history.reduce((s, p) => s + p.amount, 0)),
      },
      workers: balances,
      history: history.slice(0, 100),
    };
  }

  async createPayout(
    agencyId: string,
    dto: { workerId: string; amount: number; kind?: string; note?: string; paidAt?: string },
  ) {
    await this.assertOwnWorker(agencyId, dto.workerId);
    const amount = round2(Number(dto.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('El monto debe ser mayor a 0.');
    }
    const kind = dto.kind === 'kept_cash' ? 'kept_cash' : 'paid';
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    if (Number.isNaN(paidAt.getTime()) || paidAt.getTime() > Date.now() + 60_000) {
      throw new BadRequestException('La fecha del pago no es válida.');
    }
    const row = rowsOf(
      await this.dataSource.query(
        `INSERT INTO agency_payouts (agency_id, worker_user_id, amount, kind, note, paid_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [agencyId, dto.workerId, amount, kind, dto.note?.trim().slice(0, 300) || null, paidAt],
      ),
    )[0];
    return { id: row.id };
  }

  async deletePayout(agencyId: string, payoutId: string) {
    const rows = rowsOf(
      await this.dataSource.query(
        `DELETE FROM agency_payouts WHERE id = $1 AND agency_id = $2 RETURNING id`,
        [payoutId, agencyId],
      ),
    );
    if (!rows[0]) throw new NotFoundException('Pago no encontrado');
    return { deleted: true };
  }

  // ──────────────────────────────────────────────── cuenta con Chamba

  /**
   * Pagos digitales (QR/tarjeta): el cliente le pagó a Chamba, Chamba le debe
   * a la agencia el monto menos su comisión. Efectivo: la agencia cobró, le
   * debe a Chamba la comisión. Las liquidaciones registradas por el admin
   * descuentan. balance > 0: Chamba le debe a la agencia.
   */
  async getChambaAccount(agencyId: string) {
    const [jobs, settlements] = await Promise.all([
      this.ledgerJobs(agencyId),
      this.dataSource.query(
        `SELECT id, direction, amount, note, created_at FROM agency_settlements
         WHERE agency_id = $1 ORDER BY created_at DESC`,
        [agencyId],
      ),
    ]);
    const digital = jobs.filter((j) => j.isDigital);
    const cash = jobs.filter((j) => !j.isDigital);
    const digitalCollected = round2(digital.reduce((s, j) => s + j.amount, 0));
    const digitalFees = round2(digital.reduce((s, j) => s + j.chambaFee, 0));
    const cashFees = round2(cash.reduce((s, j) => s + j.chambaFee, 0));
    const history = rowsOf(settlements).map((s) => ({
      id: s.id,
      direction: s.direction as 'to_agency' | 'to_chamba',
      amount: Number(s.amount),
      note: s.note ?? null,
      createdAt: s.created_at,
    }));
    const paidToAgency = round2(history.filter((s) => s.direction === 'to_agency').reduce((t, s) => t + s.amount, 0));
    const paidToChamba = round2(history.filter((s) => s.direction === 'to_chamba').reduce((t, s) => t + s.amount, 0));
    const balance = round2(digitalCollected - digitalFees - cashFees - paidToAgency + paidToChamba);

    return {
      summary: {
        balance,
        digitalJobs: digital.length,
        digitalCollected,
        digitalFees,
        cashJobs: cash.length,
        cashFees,
        paidToAgency,
        paidToChamba,
      },
      jobs: jobs.map(({ requestId, title, workerName, completedAt, amount, isDigital, chambaRate, chambaFee }) => ({
        requestId,
        title,
        workerName,
        completedAt,
        amount,
        isDigital,
        chambaRate,
        chambaFee,
        /** Efecto en el saldo con Chamba. */
        effect: isDigital ? round2(amount - chambaFee) : -chambaFee,
      })),
      settlements: history,
    };
  }

  /** Lo registra el admin cuando paga a la agencia o recibe su pago. */
  async createSettlement(
    agencyId: string,
    adminId: string | null,
    dto: { direction: string; amount: number; note?: string },
  ) {
    if (!['to_agency', 'to_chamba'].includes(dto.direction)) {
      throw new BadRequestException('Indica si Chamba le pagó a la agencia o la agencia a Chamba.');
    }
    const amount = round2(Number(dto.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('El monto debe ser mayor a 0.');
    }
    const exists = rowsOf(await this.dataSource.query(`SELECT id FROM agencies WHERE id = $1`, [agencyId]))[0];
    if (!exists) throw new NotFoundException('Agencia no encontrada');
    await this.dataSource.query(
      `INSERT INTO agency_settlements (agency_id, direction, amount, note, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [agencyId, dto.direction, amount, dto.note?.trim().slice(0, 300) || null, adminId],
    );
    return this.getChambaAccount(agencyId);
  }
}
