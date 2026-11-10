import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, QueryRunner } from 'typeorm';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
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

const money = (amount: unknown) => {
  const value = Number(amount);
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
};

const PAYMENT_COLUMNS = `p.id, p.request_id, p.offer_id, p.client_user_id, p.method_code,
  p.method_name, p.provider, p.amount, p.currency, p.status, p.action, p.external_id,
  p.payload, p.expires_at, p.reported_at, p.confirmed_at, p.created_at,
  p.refund_reason, p.refund_requested_at, p.refunded_at, p.refund_note`;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly providers: PaymentProvidersRegistry,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly realtime?: RealtimeGateway,
  ) {}

  // ---------------------------------------------------------------- métodos

  /**
   * Qué método de pago tiene la solicitud. Se busca por código y, para
   * solicitudes viejas sin código, por nombre. "card" es la tarjeta de Stripe
   * (método virtual que aparece cuando Stripe está activo).
   */
  async resolveMethod(
    request: {
      payment_method_code?: string | null;
      payment_method?: string | null;
    },
    db: Queryable = this.dataSource,
  ): Promise<ResolvedMethod> {
    const code = request.payment_method_code?.trim() || null;
    const name = request.payment_method?.trim() || null;
    const cash: ResolvedMethod = {
      code: 'cash',
      name: name || 'Efectivo',
      provider: 'none',
      config: {},
    };

    if (code === 'card' || (!code && name?.toLowerCase() === 'tarjeta')) {
      const rows = rowsOf(
        await db.query(
          `SELECT value_json FROM app_config WHERE key = 'stripe_config' LIMIT 1`,
        ),
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
    if (
      !['searching', 'negotiating'].includes(row.request_status) ||
      row.offer_status !== 'pending'
    ) {
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
      this.logger.error(
        `Proveedor de pago desconocido "${method.provider}" (método ${method.code})`,
      );
      throw new BadRequestException(
        'Este método de pago no está disponible por ahora. Elige otro.',
      );
    }
    // Solo se cobra con proveedores que confirman el pago por su API: sin
    // eso el dinero podría entrar sin que nadie pueda confirmarlo.
    if (!provider.refreshStatus && !provider.handleWebhook) {
      this.logger.error(
        `El proveedor "${method.provider}" no confirma pagos por API (método ${method.code})`,
      );
      throw new BadRequestException(
        'Este método de pago todavía no está disponible. Elige otro.',
      );
    }

    // Reusar el cobro vigente de esta oferta (evita dos QR o dos cobros).
    const existing = rowsOf(
      await this.dataSource.query(
        `SELECT ${PAYMENT_COLUMNS} FROM payments p
         WHERE p.offer_id = $1 AND p.provider = $2 AND p.amount = $3::numeric
           AND p.status IN ('pending', 'paid')
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
        [
          row.request_id,
          offerId,
          clientUserId,
          method.code,
          method.name,
          method.provider,
          amount,
        ],
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

  async getForClient(
    clientUserId: string,
    paymentId: string,
  ): Promise<PaymentView> {
    const payment = await this.findPayment(paymentId);
    if (payment.client_user_id !== clientUserId) throw new ForbiddenException();
    return this.refreshAndView(payment);
  }

  /**
   * Lo llama acceptOffer dentro de su transacción: si el método de la
   * solicitud cobra en la app (QR, tarjeta…), la oferta solo se acepta con un
   * pago que el proveedor ya confirmó por el mismo monto.
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
           AND p.status IN ('pending', 'paid')
         ORDER BY p.created_at DESC`,
        [params.offerId, params.amount],
      ),
    );
    if (payments.some((p) => PAYABLE_STATUSES.includes(p.status))) return;

    // El proveedor puede haber confirmado el pago sin que la app avisara.
    for (const payment of payments) {
      const refreshed = await this.refreshStatus(payment);
      if (PAYABLE_STATUSES.includes(refreshed)) return;
    }
    throw new BadRequestException(
      'Completa el pago antes de aceptar la oferta.',
    );
  }

  /**
   * Lo llama upsertOffer: si el cliente ya pagó esta oferta, el trabajador no
   * puede cambiarle el monto (el cliente tendría que pagar dos veces).
   */
  async assertOfferAmountEditable(
    offerId: string,
    amount: number,
  ): Promise<void> {
    const paid = rowsOf(
      await this.dataSource.query(
        `SELECT amount FROM payments
         WHERE offer_id = $1 AND status = 'paid'
         ORDER BY created_at DESC LIMIT 1`,
        [offerId],
      ),
    )[0];
    if (paid && Number(paid.amount) !== Number(amount)) {
      throw new BadRequestException(
        `El cliente ya pagó Bs ${money(paid.amount)} por esta oferta. No puedes cambiar el monto.`,
      );
    }
  }

  /** Aviso automático de un proveedor (webhook). Cada proveedor valida su firma. */
  async handleWebhook(
    providerKey: string,
    body: any,
    headers: Record<string, any>,
  ) {
    const provider = this.providers.get(providerKey);
    if (!provider?.handleWebhook) throw new NotFoundException();
    const configRows = rowsOf(
      await this.dataSource.query(`SELECT config FROM payment_methods`),
    );
    const config =
      configRows
        .map((r) => parseJson(r.config))
        .find((c) => c.provider === providerKey) ?? {};
    const result = await provider.handleWebhook(body, headers, config);
    if (!result) return { ok: true };
    await this.setStatus(
      { externalId: result.externalId, provider: providerKey },
      result.status,
    );
    return { ok: true };
  }

  // ------------------------------------------------------------ reembolsos

  /**
   * Cada minuto: los pagos confirmados que ya no corresponden quedan para
   * reembolso y aparecen en Admin → Pagos → Reembolsos. Pasa cuando:
   *  - el trabajo se canceló (por el cliente, el trabajador, el admin o por
   *    tiempo), o
   *  - la solicitud ya se asignó/terminó y ese pago no es el de la oferta
   *    aceptada (pagó otra oferta, o pagó dos veces la misma).
   * Mientras la solicitud sigue abierta no se toca: el pago aún puede servir.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async flagRefunds(): Promise<number> {
    let rows: any[];
    try {
      rows = rowsOf(
        await this.dataSource.query(`
          UPDATE payments p
          SET status = 'refund_pending',
              refund_requested_at = NOW(),
              updated_at = NOW(),
              refund_reason = CASE
                WHEN jr.status = 'cancelled' THEN 'El trabajo se canceló'
                ELSE 'El cliente pagó una oferta que no se aceptó o pagó dos veces'
              END
          FROM job_requests jr
          WHERE p.request_id = jr.id
            AND p.status = 'paid'
            AND (
              jr.status = 'cancelled'
              OR (
                jr.status IN ('assigned', 'in_progress', 'completed')
                AND p.id IS DISTINCT FROM (
                  SELECT p2.id
                  FROM payments p2
                  JOIN job_offers jo ON jo.id = p2.offer_id
                  WHERE p2.request_id = jr.id
                    AND p2.status = 'paid'
                    AND jo.status = 'accepted'
                    AND p2.amount = jo.amount
                  ORDER BY p2.confirmed_at ASC NULLS LAST, p2.created_at ASC
                  LIMIT 1
                )
              )
            )
          RETURNING p.id, p.request_id, p.client_user_id, p.amount, p.refund_reason, jr.title`),
      );
    } catch (error) {
      this.logger.error(
        `No se pudieron revisar los reembolsos: ${(error as Error).message}`,
      );
      return 0;
    }
    for (const row of rows) {
      this.logger.log(
        `Pago ${row.id}: reembolso pendiente (${row.refund_reason})`,
      );
      this.realtime?.emitToAdmins('payment.refund_pending', {
        paymentId: row.id,
        requestId: row.request_id,
        amount: Number(row.amount),
      });
      await this.notifications
        ?.notifyPaymentRefund({
          userId: row.client_user_id,
          requestId: row.request_id,
          jobTitle: row.title ?? 'tu trabajo',
          amount: Number(row.amount),
          stage: 'pending',
        })
        .catch((error: Error) =>
          this.logger.warn(
            `No se pudo avisar el reembolso ${row.id}: ${error.message}`,
          ),
        );
    }
    return rows.length;
  }

  /** El admin decide devolver un pago confirmado (por ejemplo, tras una queja). */
  async adminStartRefund(paymentId: string, adminId: string, reason?: string) {
    const motive = reason?.trim();
    if (!motive || motive.length < 3) {
      throw new BadRequestException('Escribe el motivo del reembolso.');
    }
    const row = rowsOf(
      await this.dataSource.query(
        `UPDATE payments p
         SET status = 'refund_pending', refund_reason = $2, refund_requested_at = NOW(),
             updated_at = NOW()
         FROM job_requests jr
         WHERE p.id = $1 AND p.status = 'paid' AND jr.id = p.request_id
         RETURNING p.id, p.request_id, p.client_user_id, p.amount, jr.title`,
        [paymentId, motive.slice(0, 500)],
      ),
    )[0];
    if (!row) {
      await this.findPayment(paymentId);
      throw new BadRequestException(
        'Solo se puede reembolsar un pago confirmado.',
      );
    }
    this.logger.log(
      `Pago ${paymentId}: el admin ${adminId} pidió reembolsarlo (${motive})`,
    );
    await this.notifyRefund(row, 'pending');
    return { ok: true, status: 'refund_pending' };
  }

  /** El admin ya devolvió el dinero (transferencia, Stripe…): se cierra el reembolso. */
  async adminMarkRefunded(paymentId: string, adminId: string, note?: string) {
    const row = rowsOf(
      await this.dataSource.query(
        `UPDATE payments p
         SET status = 'refunded', refunded_at = NOW(), refunded_by = $2,
             refund_note = $3, updated_at = NOW()
         FROM job_requests jr
         WHERE p.id = $1 AND p.status = 'refund_pending' AND jr.id = p.request_id
         RETURNING p.id, p.request_id, p.client_user_id, p.amount, jr.title`,
        [paymentId, adminId, note?.trim().slice(0, 500) || null],
      ),
    )[0];
    if (!row) {
      await this.findPayment(paymentId);
      throw new BadRequestException(
        'Este pago no tiene un reembolso pendiente.',
      );
    }
    await this.notifyRefund(row, 'done');
    return { ok: true, status: 'refunded' };
  }

  /** El admin revisó el reembolso y decidió no devolverlo (queda el motivo). */
  async adminDeclineRefund(paymentId: string, adminId: string, note?: string) {
    const motive = note?.trim();
    if (!motive || motive.length < 3) {
      throw new BadRequestException('Escribe por qué no se reembolsa.');
    }
    const row = rowsOf(
      await this.dataSource.query(
        `UPDATE payments
         SET status = 'refund_declined', refunded_by = $2, refund_note = $3, updated_at = NOW()
         WHERE id = $1 AND status = 'refund_pending'
         RETURNING id`,
        [paymentId, adminId, motive.slice(0, 500)],
      ),
    )[0];
    if (!row) {
      await this.findPayment(paymentId);
      throw new BadRequestException(
        'Este pago no tiene un reembolso pendiente.',
      );
    }
    return { ok: true, status: 'refund_declined' };
  }

  /** Confirmación manual de pago y emisión directa de reembolso por administración. */
  async adminConfirmAndRefund(
    paymentId: string,
    adminId: string,
    reason?: string,
  ) {
    const payment = await this.findPayment(paymentId);
    const motive =
      reason?.trim() ||
      payment.refund_reason ||
      'Reembolso autorizado por administración';

    // Si status era pending o reported, primero se confirma el cobro
    if (['pending', 'reported'].includes(payment.status)) {
      await this.dataSource.query(
        `UPDATE payments
         SET status = 'paid', confirmed_at = NOW(), confirmed_by = $2, updated_at = NOW()
         WHERE id = $1`,
        [paymentId, adminId],
      );
    }

    const row = rowsOf(
      await this.dataSource.query(
        `UPDATE payments p
         SET status = 'refunded',
             refunded_at = NOW(),
             refunded_by = $2,
             refund_reason = $3,
             refund_note = $4,
             updated_at = NOW()
         FROM job_requests jr
         WHERE p.id = $1 AND jr.id = p.request_id
         RETURNING p.id, p.request_id, p.client_user_id, p.amount, jr.title`,
        [paymentId, adminId, motive, reason?.trim().slice(0, 500) || null],
      ),
    )[0];

    if (!row) {
      throw new BadRequestException('No se pudo procesar el reembolso.');
    }

    this.logger.log(
      `Pago ${paymentId}: el admin ${adminId} confirmó y reembolsó (${motive})`,
    );
    await this.notifyRefund(row, 'done');
    return { ok: true, status: 'refunded' };
  }

  /** Descarta un pago pendiente o reportado marcándolo como fallido. */
  async adminDiscardPayment(paymentId: string, adminId: string, note?: string) {
    const motive = note?.trim() || 'Descartado por administración';
    const row = rowsOf(
      await this.dataSource.query(
        `UPDATE payments
         SET status = 'failed', admin_note = $2, failure_reason = $2, updated_at = NOW()
         WHERE id = $1
         RETURNING id`,
        [paymentId, motive],
      ),
    )[0];
    if (!row) {
      await this.findPayment(paymentId);
      throw new BadRequestException('No se pudo descartar el pago.');
    }
    return { ok: true, status: 'failed' };
  }

  // ---------------------------------------------------------------- admin

  async listForClient(clientUserId: string) {
    const rows = await this.dataSource.query(
      `SELECT ${PAYMENT_COLUMNS}, jr.title AS request_title, jr.status AS request_status,
              jr.cancel_reason, jr.cancelled_by_role
       FROM payments p
       JOIN job_requests jr ON jr.id = p.request_id
       WHERE p.client_user_id = $1
         AND p.status IN ('paid', 'refund_pending', 'refunded', 'refund_declined', 'reported', 'pending')
       ORDER BY p.created_at DESC
       LIMIT 100`,
      [clientUserId],
    );
    return rowsOf(rows).map((r) => ({
      id: r.id,
      requestId: r.request_id,
      requestTitle: r.request_title,
      requestStatus: r.request_status,
      methodName: r.method_name,
      provider: r.provider,
      amount: Number(r.amount),
      currency: r.currency,
      status: r.status,
      createdAt: r.created_at,
      confirmedAt: r.confirmed_at,
      refundReason: r.refund_reason ?? null,
      refundRequestedAt: r.refund_requested_at ?? null,
      refundedAt: r.refunded_at ?? null,
      refundNote: r.refund_note ?? null,
      cancelReason: r.cancel_reason ?? null,
      cancelledByRole: r.cancelled_by_role ?? null,
    }));
  }

  async adminList(status?: string) {
    const rows = await this.dataSource.query(
      `SELECT ${PAYMENT_COLUMNS}, jr.title AS request_title, jr.status AS request_status,
              jr.cancel_reason, jr.cancelled_by_role, jr.cancelled_by,
              TRIM(CONCAT(cb.first_name, ' ', COALESCE(cb.last_name, ''))) AS cancelled_by_name,
              TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS client_name,
              u.email AS client_email, u.phone AS client_phone
       FROM payments p
       JOIN job_requests jr ON jr.id = p.request_id
       LEFT JOIN users u ON u.id = p.client_user_id
       LEFT JOIN users cb ON cb.id = jr.cancelled_by
       WHERE ($1::text IS NULL OR p.status = $1)
         AND p.status <> 'cancelled'
       ORDER BY (p.status = 'refund_pending') DESC, p.created_at DESC
       LIMIT 200`,
      [status || null],
    );
    return rowsOf(rows).map((r) => ({
      id: r.id,
      requestId: r.request_id,
      requestTitle: r.request_title,
      requestStatus: r.request_status,
      clientName: r.client_name,
      clientEmail: r.client_email,
      clientPhone: r.client_phone ?? null,
      methodName: r.method_name,
      provider: r.provider,
      amount: Number(r.amount),
      currency: r.currency,
      status: r.status,
      externalId: r.external_id ?? null,
      createdAt: r.created_at,
      confirmedAt: r.confirmed_at,
      refundReason: r.refund_reason ?? null,
      refundRequestedAt: r.refund_requested_at ?? null,
      refundedAt: r.refunded_at ?? null,
      refundNote: r.refund_note ?? null,
      cancelReason: r.cancel_reason ?? null,
      cancelledByRole: r.cancelled_by_role ?? null,
      cancelledBy: r.cancelled_by ?? null,
      cancelledByName: r.cancelled_by_name?.trim() || null,
    }));
  }

  // -------------------------------------------------------------- interno

  private async notifyRefund(row: any, stage: 'pending' | 'done') {
    this.realtime?.emitToAdmins('payment.refund_updated', {
      paymentId: row.id,
      stage,
    });
    await this.notifications
      ?.notifyPaymentRefund({
        userId: row.client_user_id,
        requestId: row.request_id,
        jobTitle: row.title ?? 'tu trabajo',
        amount: Number(row.amount),
        stage,
      })
      .catch((error: Error) =>
        this.logger.warn(
          `No se pudo avisar el reembolso ${row.id}: ${error.message}`,
        ),
      );
  }

  private notRequired(
    amount: number,
    title: string,
    methodName: string,
  ): PaymentView {
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
      await this.dataSource.query(
        `SELECT ${PAYMENT_COLUMNS} FROM payments p WHERE p.id = $1`,
        [paymentId],
      ),
    )[0];
    if (!row) throw new NotFoundException('Pago no encontrado');
    return row;
  }

  private async refreshAndView(payment: any): Promise<PaymentView> {
    const status = await this.refreshStatus(payment);
    return this.toView({ ...payment, status });
  }

  /** Vence los cobros viejos y pregunta al proveedor si el pago ya entró. */
  private async refreshStatus(payment: any): Promise<PaymentStatus> {
    if (payment.status !== 'pending') return payment.status;
    if (payment.expires_at && new Date(payment.expires_at) <= new Date()) {
      await this.setStatus({ id: payment.id }, 'expired');
      return 'expired';
    }
    const provider = this.providers.get(payment.provider);
    if (!provider?.refreshStatus) return payment.status;
    try {
      const method = await this.resolveMethod({
        payment_method_code: payment.method_code,
      });
      const next = await provider.refreshStatus(
        payment as StoredPayment,
        method.config,
      );
      if (next && next !== payment.status) {
        await this.setStatus({ id: payment.id }, next);
        return next;
      }
    } catch (error) {
      this.logger.warn(
        `No se pudo consultar el pago ${payment.id}: ${(error as Error).message}`,
      );
    }
    return payment.status;
  }

  private async setStatus(
    where: { id: string } | { externalId: string; provider: string },
    status: PaymentStatus,
  ) {
    const confirmed =
      status === 'paid' ? ', confirmed_at = COALESCE(confirmed_at, NOW())' : '';
    // Un pago que el proveedor confirma es dinero recibido: se registra aunque
    // el cobro local ya hubiera vencido o se hubiera anulado. Si ya no sirve,
    // flagRefunds lo pasa a reembolso.
    const from =
      status === 'paid'
        ? `('pending', 'reported', 'expired', 'cancelled', 'failed')`
        : `('pending', 'reported')`;
    if ('id' in where) {
      await this.dataSource.query(
        `UPDATE payments SET status = $2, updated_at = NOW()${confirmed}
         WHERE id = $1 AND status IN ${from}`,
        [where.id, status],
      );
    } else {
      await this.dataSource.query(
        `UPDATE payments SET status = $3, updated_at = NOW()${confirmed}
         WHERE external_id = $1 AND provider = $2 AND status IN ${from}`,
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
      card: pending ? (payload.card ?? null) : null,
      url: payload.url ?? null,
      expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      canReportPaid: false,
      pollSeconds: pending ? Number(payload.pollSeconds) || 0 : 0,
    };
  }
}
