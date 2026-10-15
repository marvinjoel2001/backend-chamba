import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { StorageService } from '../../infrastructure/storage/storage.service';
import {
  PAYABLE_STATUSES,
  PaymentStatus,
  PaymentView,
  StoredPayment,
} from './payment-provider';
import { PaymentProvidersRegistry } from './providers';

type Queryable = Pick<DataSource, 'query'> | QueryRunner;

/** Método resuelto para una solicitud: qué proveedor cobra y con qué config. */
export interface ResolvedMethod {
  code: string;
  name: string;
  provider: string;
  config: Record<string, any>;
}

const rowsOf = (raw: any): any[] =>
  Array.isArray(raw?.[0]) ? raw[0] : Array.isArray(raw) ? raw : [];

const parseJson = (value: unknown): Record<string, any> => {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, any>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const PAYMENT_COLUMNS = `p.id, p.request_id, p.offer_id, p.client_user_id, p.method_code,
  p.method_name, p.provider, p.amount, p.currency, p.status, p.action, p.external_id,
  p.payload, p.expires_at, p.reported_at, p.confirmed_at, p.created_at`;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly providers: PaymentProvidersRegistry,
    private readonly storage: StorageService,
  ) {}

  // ---------------------------------------------------------------- métodos

  /**
   * Qué método de pago tiene la solicitud. Se busca por código y, para
   * solicitudes viejas sin código, por nombre. "card" es la tarjeta de Stripe
   * (método virtual que aparece cuando Stripe está activo).
   */
  async resolveMethod(
    request: { payment_method_code?: string | null; payment_method?: string | null },
    db: Queryable = this.dataSource,
  ): Promise<ResolvedMethod> {
    const code = request.payment_method_code?.trim() || null;
    const name = request.payment_method?.trim() || null;
    const cash: ResolvedMethod = { code: 'cash', name: name || 'Efectivo', provider: 'none', config: {} };

    if (code === 'card' || (!code && name?.toLowerCase() === 'tarjeta')) {
      const rows = rowsOf(
        await db.query(`SELECT value_json FROM app_config WHERE key = 'stripe_config' LIMIT 1`),
      );
      const stripe = parseJson(rows[0]?.value_json);
      return stripe.active
        ? { code: 'card', name: 'Tarjeta', provider: 'stripe', config: {} }
        : cash;
    }
    if (!code && !name) return cash;

    const rows = rowsOf(
      await db.query(
        `SELECT code, name, config, "isActive" AS is_active
         FROM payment_methods
         WHERE ($1::text IS NOT NULL AND code = $1)
            OR ($1::text IS NULL AND LOWER(name) = LOWER($2))
         LIMIT 1`,
        [code, name],
      ),
    );
    const method = rows[0];
    // Un método borrado o desactivado ya no se puede cobrar en la app: el
    // trabajo sigue y se paga como se acuerde (igual que efectivo).
    if (!method || !method.is_active) return cash;
    const config = parseJson(method.config);
    return {
      code: method.code,
      name: method.name,
      provider: String(config.provider || 'none'),
      config,
    };
  }

  /** Lista pública para la app: sin `config` (puede tener claves). */
  providerOptions() {
    return this.providers.list();
  }

  // ------------------------------------------------------------------ app

  async checkout(clientUserId: string, offerId: string): Promise<PaymentView> {
    if (!offerId) throw new BadRequestException('offerId es obligatorio');
    const rows = rowsOf(
      await this.dataSource.query(
        `SELECT jo.id AS offer_id, jo.amount, jo.status AS offer_status,
                jr.id AS request_id, jr.client_user_id, jr.status AS request_status,
                jr.title, jr.payment_method, jr.payment_method_code
         FROM job_offers jo
         JOIN job_requests jr ON jr.id = jo.request_id
         WHERE jo.id = $1`,
        [offerId],
      ),
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Oferta no encontrada');
    if (row.client_user_id !== clientUserId) throw new ForbiddenException();
    if (!['searching', 'negotiating'].includes(row.request_status) || row.offer_status !== 'pending') {
      throw new BadRequestException('La oferta ya no está disponible');
    }

    const amount = Number(row.amount);
    const method = await this.resolveMethod(row);
    const title = `Pago de "${row.title || 'tu trabajo'}"`;
    if (method.provider === 'none') {
      return this.notRequired(amount, title, method.name);
    }

    const provider = this.providers.get(method.provider);
    if (!provider) {
      this.logger.error(`Proveedor de pago desconocido "${method.provider}" (método ${method.code})`);
      throw new BadRequestException('Este método de pago no está disponible por ahora. Elige otro.');
    }

    // Reusar el cobro vigente de esta oferta (evita dos QR o dos cobros).
    const existing = rowsOf(
      await this.dataSource.query(
        `SELECT ${PAYMENT_COLUMNS} FROM payments p
         WHERE p.offer_id = $1 AND p.provider = $2 AND p.amount = $3::numeric
           AND p.status IN ('pending', 'reported', 'paid')
           AND (p.expires_at IS NULL OR p.expires_at > NOW() OR p.status <> 'pending')
         ORDER BY p.created_at DESC LIMIT 1`,
        [offerId, method.provider, amount],
      ),
    )[0];
    if (existing) return this.refreshAndView(existing);

    // Los cobros pendientes anteriores (otro monto u otro proveedor) se anulan.
    await this.dataSource.query(
      `UPDATE payments SET status = 'cancelled', updated_at = NOW()
       WHERE offer_id = $1 AND status = 'pending'`,
      [offerId],
    );
    const inserted = rowsOf(
      await this.dataSource.query(
        `INSERT INTO payments (request_id, offer_id, client_user_id, method_code, method_name,
                               provider, amount, currency, status, action)
         VALUES ($1, $2, $3, $4, $5, $6, $7::numeric, 'BOB', 'pending', 'none')
         RETURNING id`,
        [row.request_id, offerId, clientUserId, method.code, method.name, method.provider, amount],
      ),
    )[0];

    try {
      const result = await provider.createCheckout({
        paymentId: inserted.id,
        requestId: row.request_id,
        offerId,
        clientUserId,
        amount,
        currency: method.config.currency ?? null,
        title,
        config: method.config,
      });
      const payload = {
        ...result.payload,
        title,
        canReportPaid: result.canReportPaid ?? false,
        pollSeconds: result.pollSeconds ?? 0,
      };
      const saved = rowsOf(
        await this.dataSource.query(
          `UPDATE payments
           SET status = $2, action = $3, currency = $4, external_id = $5,
               payload = $6::jsonb, expires_at = $7, updated_at = NOW()
           WHERE id = $1
           RETURNING ${PAYMENT_COLUMNS.replace(/p\./g, '')}`,
          [
            inserted.id,
            result.status,
            result.action,
            result.currency,
            result.externalId ?? null,
            JSON.stringify(payload),
            result.expiresAt ?? null,
          ],
        ),
      )[0];
      return this.toView(saved);
    } catch (error) {
      await this.dataSource.query(
        `UPDATE payments SET status = 'failed', failure_reason = $2, updated_at = NOW() WHERE id = $1`,
        [inserted.id, (error as Error)?.message?.slice(0, 500) ?? 'error'],
      );
      throw error;
    }
  }

  async getForClient(clientUserId: string, paymentId: string): Promise<PaymentView> {
    const payment = await this.findPayment(paymentId);
    if (payment.client_user_id !== clientUserId) throw new ForbiddenException();
    return this.refreshAndView(payment);
  }

  /** "Ya pagué": solo para métodos que confirma una persona (QR fijo). */
  async reportPaid(clientUserId: string, paymentId: string): Promise<PaymentView> {
    const payment = await this.findPayment(paymentId);
    if (payment.client_user_id !== clientUserId) throw new ForbiddenException();
    if (!parseJson(payment.payload).canReportPaid) {
      throw new BadRequestException('Este pago se confirma automáticamente.');
    }
    if (payment.status === 'pending') {
      const updated = rowsOf(
        await this.dataSource.query(
          `UPDATE payments SET status = 'reported', reported_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND status = 'pending'
           RETURNING ${PAYMENT_COLUMNS.replace(/p\./g, '')}`,
          [paymentId],
        ),
      )[0];
      if (updated) return this.toView(updated);
    }
    return this.toView(payment);
  }

  /**
   * Lo llama acceptOffer dentro de su transacción: si el método de la
   * solicitud cobra en la app, la oferta solo se acepta con un pago hecho
   * (o reportado) por el mismo monto.
   */
  async assertOfferPaid(
    runner: QueryRunner,
    params: { requestId: string; offerId: string; amount: number },
  ): Promise<void> {
    const request = rowsOf(
      await runner.query(
        `SELECT payment_method, payment_method_code FROM job_requests WHERE id = $1`,
        [params.requestId],
      ),
    )[0];
    if (!request) return;
    const method = await this.resolveMethod(request, runner);
    if (method.provider === 'none') return;

    const payments = rowsOf(
      await runner.query(
        `SELECT ${PAYMENT_COLUMNS} FROM payments p
         WHERE p.offer_id = $1 AND p.amount = $2::numeric
           AND p.status IN ('pending', 'reported', 'paid')
         ORDER BY p.created_at DESC`,
        [params.offerId, params.amount],
      ),
    );
    if (payments.some((p) => PAYABLE_STATUSES.includes(p.status))) return;

    // El pago con tarjeta puede haberse completado sin que la app avisara.
    for (const payment of payments) {
      const refreshed = await this.refreshStatus(payment);
      if (PAYABLE_STATUSES.includes(refreshed)) return;
    }
    throw new BadRequestException('Completa el pago antes de aceptar la oferta.');
  }

  /** Aviso automático de un proveedor (webhook). */
  async handleWebhook(providerKey: string, body: any, headers: Record<string, any>) {
    const provider = this.providers.get(providerKey);
    if (!provider?.handleWebhook) throw new NotFoundException();
    const configRows = rowsOf(
      await this.dataSource.query(`SELECT config FROM payment_methods`),
    );
    const config =
      configRows.map((r) => parseJson(r.config)).find((c) => c.provider === providerKey) ?? {};
    const result = await provider.handleWebhook(body, headers, config);
    if (!result) return { ok: true };
    await this.setStatus({ externalId: result.externalId, provider: providerKey }, result.status);
    return { ok: true };
  }

  // ---------------------------------------------------------------- admin

  async adminList(status?: string) {
    const rows = await this.dataSource.query(
      `SELECT ${PAYMENT_COLUMNS}, jr.title AS request_title,
              TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS client_name,
              u.email AS client_email
       FROM payments p
       JOIN job_requests jr ON jr.id = p.request_id
       LEFT JOIN users u ON u.id = p.client_user_id
       WHERE ($1::text IS NULL OR p.status = $1)
         AND p.status <> 'cancelled'
       ORDER BY (p.status = 'reported') DESC, p.created_at DESC
       LIMIT 200`,
      [status || null],
    );
    return rowsOf(rows).map((r) => ({
      id: r.id,
      requestId: r.request_id,
      requestTitle: r.request_title,
      clientName: r.client_name,
      clientEmail: r.client_email,
      methodName: r.method_name,
      provider: r.provider,
      amount: Number(r.amount),
      currency: r.currency,
      status: r.status,
      createdAt: r.created_at,
      reportedAt: r.reported_at,
      confirmedAt: r.confirmed_at,
    }));
  }

  async adminConfirm(paymentId: string, adminId: string) {
    const payment = await this.findPayment(paymentId);
    if (!['pending', 'reported'].includes(payment.status)) {
      throw new BadRequestException('Este pago ya no se puede confirmar.');
    }
    await this.dataSource.query(
      `UPDATE payments SET status = 'paid', confirmed_at = NOW(), confirmed_by = $2, updated_at = NOW()
       WHERE id = $1`,
      [paymentId, adminId],
    );
    return { ok: true };
  }

  async adminReject(paymentId: string, adminId: string, reason?: string) {
    const payment = await this.findPayment(paymentId);
    if (!['pending', 'reported'].includes(payment.status)) {
      throw new BadRequestException('Este pago ya no se puede rechazar.');
    }
    await this.dataSource.query(
      `UPDATE payments SET status = 'failed', confirmed_by = $2, failure_reason = $3, updated_at = NOW()
       WHERE id = $1`,
      [paymentId, adminId, reason?.slice(0, 500) || 'Rechazado por el administrador'],
    );
    return { ok: true };
  }

  async uploadQrImage(base64Data: string) {
    if (!base64Data?.startsWith('data:image/')) {
      throw new BadRequestException('Sube una imagen (PNG o JPG).');
    }
    if (base64Data.length > 4_000_000) {
      throw new BadRequestException('La imagen es muy pesada (máx. ~3 MB).');
    }
    const upload = await this.storage.uploadBase64Image({ base64Data, folder: 'chamba/payment-qr' });
    return { url: upload.url };
  }

  // -------------------------------------------------------------- interno

  private notRequired(amount: number, title: string, methodName: string): PaymentView {
    return {
      id: null,
      status: 'not_required',
      action: 'none',
      amount,
      currency: 'BOB',
      title,
      methodName,
      instructions: null,
      qr: null,
      card: null,
      url: null,
      expiresAt: null,
      canReportPaid: false,
      pollSeconds: 0,
    };
  }

  private async findPayment(paymentId: string) {
    const row = rowsOf(
      await this.dataSource.query(`SELECT ${PAYMENT_COLUMNS} FROM payments p WHERE p.id = $1`, [paymentId]),
    )[0];
    if (!row) throw new NotFoundException('Pago no encontrado');
    return row;
  }

  private async refreshAndView(payment: any): Promise<PaymentView> {
    const status = await this.refreshStatus(payment);
    return this.toView({ ...payment, status });
  }

  /** Vence los QR viejos y pregunta al proveedor si el pago ya entró. */
  private async refreshStatus(payment: any): Promise<PaymentStatus> {
    if (payment.status !== 'pending') return payment.status;
    if (payment.expires_at && new Date(payment.expires_at) <= new Date()) {
      await this.setStatus({ id: payment.id }, 'expired');
      return 'expired';
    }
    const provider = this.providers.get(payment.provider);
    if (!provider?.refreshStatus) return payment.status;
    try {
      const method = await this.resolveMethod({ payment_method_code: payment.method_code });
      const next = await provider.refreshStatus(payment as StoredPayment, method.config);
      if (next && next !== payment.status) {
        await this.setStatus({ id: payment.id }, next);
        return next;
      }
    } catch (error) {
      this.logger.warn(`No se pudo consultar el pago ${payment.id}: ${(error as Error).message}`);
    }
    return payment.status;
  }

  private async setStatus(
    where: { id: string } | { externalId: string; provider: string },
    status: PaymentStatus,
  ) {
    const confirmed = status === 'paid' ? ', confirmed_at = COALESCE(confirmed_at, NOW())' : '';
    if ('id' in where) {
      await this.dataSource.query(
        `UPDATE payments SET status = $2, updated_at = NOW()${confirmed} WHERE id = $1`,
        [where.id, status],
      );
    } else {
      await this.dataSource.query(
        `UPDATE payments SET status = $3, updated_at = NOW()${confirmed}
         WHERE external_id = $1 AND provider = $2 AND status IN ('pending', 'reported')`,
        [where.externalId, where.provider, status],
      );
    }
  }

  private toView(row: any): PaymentView {
    const payload = parseJson(row.payload);
    const pending = row.status === 'pending';
    return {
      id: row.id,
      status: row.status,
      action: row.action,
      amount: Number(row.amount),
      currency: row.currency,
      title: payload.title ?? 'Pago',
      methodName: row.method_name ?? '',
      instructions: payload.instructions ?? null,
      qr: payload.qr ?? null,
      // El secreto de la tarjeta solo hace falta mientras se está pagando.
      card: pending ? payload.card ?? null : null,
      url: payload.url ?? null,
      expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      canReportPaid: pending && payload.canReportPaid === true,
      pollSeconds: ['pending', 'reported'].includes(row.status) ? Number(payload.pollSeconds) || 0 : 0,
    };
  }
}
