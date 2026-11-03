import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentProvidersRegistry, StripeCardProvider } from './providers';
import type { PaymentProvider } from './payment-provider';

/**
 * Base de datos falsa mínima: responde según el SQL y guarda los pagos en
 * memoria para poder seguir el flujo checkout → confirmar por API → aceptar.
 */
function fakeDb(options: {
  method?: {
    code: string;
    name: string;
    config: any;
    is_active?: boolean;
  } | null;
  offer?: Partial<Record<string, any>>;
  stripeActive?: boolean;
}) {
  const payments: any[] = [];
  const offer = {
    offer_id: 'o1',
    amount: '150.00',
    offer_status: 'pending',
    request_id: 'r1',
    client_user_id: 'c1',
    request_status: 'negotiating',
    title: 'Pintar sala',
    payment_method: options.method?.name ?? 'Efectivo',
    payment_method_code: options.method?.code ?? 'cash',
    ...options.offer,
  };
  const query = jest.fn(async (sql: string, args: any[] = []) => {
    if (sql.includes('FROM job_offers jo') && sql.includes('WHERE jo.id = $1'))
      return [offer];
    if (sql.includes("key = 'stripe_config'"))
      return [
        {
          value_json: JSON.stringify({ active: options.stripeActive ?? false }),
        },
      ];
    if (sql.includes('FROM payment_methods'))
      return options.method
        ? [
            {
              ...options.method,
              config: JSON.stringify(options.method.config),
              is_active: options.method.is_active ?? true,
            },
          ]
        : [];
    if (
      sql.includes(
        'SELECT payment_method, payment_method_code FROM job_requests',
      )
    )
      return [
        {
          payment_method: offer.payment_method,
          payment_method_code: offer.payment_method_code,
        },
      ];
    if (sql.startsWith('INSERT INTO payments')) {
      const row = {
        id: `p${payments.length + 1}`,
        request_id: args[0],
        offer_id: args[1],
        client_user_id: args[2],
        method_code: args[3],
        method_name: args[4],
        provider: args[5],
        amount: String(args[6]),
        currency: 'BOB',
        status: 'pending',
        action: 'none',
        payload: {},
        expires_at: null,
        external_id: null,
      };
      payments.push(row);
      return [{ id: row.id }];
    }
    if (
      sql.includes('UPDATE payments') &&
      sql.includes('SET status = $2, action = $3')
    ) {
      const row = payments.find((p) => p.id === args[0]);
      Object.assign(row, {
        status: args[1],
        action: args[2],
        currency: args[3],
        external_id: args[4],
        payload: JSON.parse(args[5]),
        expires_at: args[6],
      });
      return [row];
    }
    if (sql.includes("SET status = 'cancelled'")) {
      payments
        .filter((p) => p.offer_id === args[0] && p.status === 'pending')
        .forEach((p) => (p.status = 'cancelled'));
      return [];
    }
    if (
      sql.includes('UPDATE payments SET status = $2') &&
      sql.includes('WHERE id = $1')
    ) {
      const row = payments.find((p) => p.id === args[0]);
      if (row) row.status = args[1];
      return [];
    }
    if (
      sql.includes('FROM payments p') &&
      sql.includes('p.offer_id = $1 AND p.provider = $2')
    ) {
      return payments
        .filter(
          (p) =>
            p.offer_id === args[0] &&
            p.provider === args[1] &&
            Number(p.amount) === Number(args[2]) &&
            ['pending', 'paid'].includes(p.status),
        )
        .reverse();
    }
    if (
      sql.includes('FROM payments p') &&
      sql.includes('p.offer_id = $1 AND p.amount = $2')
    ) {
      return payments.filter(
        (p) =>
          p.offer_id === args[0] &&
          Number(p.amount) === Number(args[1]) &&
          ['pending', 'paid'].includes(p.status),
      );
    }
    if (sql.includes("WHERE offer_id = $1 AND status = 'paid'")) {
      return payments.filter(
        (p) => p.offer_id === args[0] && p.status === 'paid',
      );
    }
    if (sql.includes('FROM payments p WHERE p.id = $1'))
      return payments.filter((p) => p.id === args[0]);
    return [];
  });
  return { query, payments };
}

/** Proveedor de QR conectado por API (como será el del banco). */
function apiQrProvider(
  status: { next: any } = { next: null },
): PaymentProvider {
  return {
    key: 'bank_qr',
    label: 'QR del banco (API)',
    createCheckout: jest.fn(async () => ({
      action: 'qr' as const,
      status: 'pending' as const,
      currency: 'BOB',
      externalId: 'bank-123',
      expiresAt: new Date(Date.now() + 10 * 60_000),
      pollSeconds: 5,
      payload: {
        instructions: 'Escanea el QR',
        qr: { imageUrl: null, imageBase64: 'data:image/png;base64,AAA' },
      },
    })),
    refreshStatus: jest.fn(async () => status.next),
  };
}

function build(
  db: ReturnType<typeof fakeDb>,
  stripe: Record<string, jest.Mock> = {},
  extra: PaymentProvider[] = [],
) {
  const registry = new PaymentProvidersRegistry(
    new StripeCardProvider(stripe as any),
  );
  for (const provider of extra)
    (registry as any).providers.set(provider.key, provider);
  return new PaymentsService({ query: db.query } as any, registry);
}

const qrMethod = {
  code: 'qr_banco',
  name: 'QR',
  config: { provider: 'bank_qr' },
};

describe('PaymentsService', () => {
  it('efectivo: no pide pago y la app sigue directo', async () => {
    const db = fakeDb({ method: null });
    const view = await build(db).checkout('c1', 'o1');
    expect(view).toMatchObject({
      id: null,
      status: 'not_required',
      action: 'none',
      amount: 150,
    });
    expect(db.payments).toHaveLength(0);
  });

  it('QR con API: devuelve el QR del banco, sin botón "Ya pagué"', async () => {
    const db = fakeDb({ method: qrMethod });
    const view = await build(db, {}, [apiQrProvider()]).checkout('c1', 'o1');
    expect(view).toMatchObject({
      status: 'pending',
      action: 'qr',
      amount: 150,
      methodName: 'QR',
      instructions: 'Escanea el QR',
      canReportPaid: false,
      card: null,
    });
    expect(view.pollSeconds).toBeGreaterThan(0);
    expect(db.payments[0].external_id).toBe('bank-123');
  });

  it('reutiliza el mismo cobro si se vuelve a abrir (no genera otro QR)', async () => {
    const db = fakeDb({ method: qrMethod });
    const service = build(db, {}, [apiQrProvider()]);
    const first = await service.checkout('c1', 'o1');
    const again = await service.checkout('c1', 'o1');
    expect(again.id).toBe(first.id);
    expect(db.payments).toHaveLength(1);
  });

  it('si el método está desactivado se trata como efectivo', async () => {
    const db = fakeDb({ method: { ...qrMethod, is_active: false } });
    const view = await build(db).checkout('c1', 'o1');
    expect(view.status).toBe('not_required');
  });

  it('proveedor desconocido (p. ej. el QR fijo que ya no existe): error claro', async () => {
    const legacy = fakeDb({
      method: { ...qrMethod, config: { provider: 'manual_qr' } },
    });
    await expect(build(legacy).checkout('c1', 'o1')).rejects.toThrow(
      BadRequestException,
    );
    expect(legacy.payments).toHaveLength(0);
  });

  it('no cobra con un proveedor que no confirma pagos por API', async () => {
    const db = fakeDb({ method: qrMethod });
    const sinApi: PaymentProvider = {
      key: 'bank_qr',
      label: 'QR sin API',
      createCheckout: jest.fn(),
    };
    await expect(build(db, {}, [sinApi]).checkout('c1', 'o1')).rejects.toThrow(
      'todavía no está disponible',
    );
    expect(sinApi.createCheckout).not.toHaveBeenCalled();
    expect(db.payments).toHaveLength(0);
  });

  it('solo el cliente de la solicitud puede cobrar la oferta', async () => {
    const db = fakeDb({ method: qrMethod });
    await expect(
      build(db, {}, [apiQrProvider()]).checkout('otro', 'o1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('aceptar la oferta exige el pago confirmado por la API del proveedor', async () => {
    const status = { next: null as any };
    const db = fakeDb({ method: qrMethod });
    const service = build(db, {}, [apiQrProvider(status)]);
    const runner = { query: db.query } as any;
    const params = { requestId: 'r1', offerId: 'o1', amount: 150 };

    await expect(service.assertOfferPaid(runner, params)).rejects.toThrow(
      'Completa el pago',
    );

    await service.checkout('c1', 'o1');
    // Pendiente: el banco aún no confirmó.
    await expect(service.assertOfferPaid(runner, params)).rejects.toThrow(
      'Completa el pago',
    );

    // El banco confirma por su API.
    status.next = 'paid';
    await expect(
      service.assertOfferPaid(runner, params),
    ).resolves.toBeUndefined();
    expect(db.payments[0].status).toBe('paid');

    // Si el trabajador cambió el monto, el pago anterior ya no alcanza.
    await expect(
      service.assertOfferPaid(runner, { ...params, amount: 200 }),
    ).rejects.toThrow('Completa el pago');
  });

  it('el trabajador no puede cambiar el monto de una oferta ya pagada', async () => {
    const status = { next: 'paid' as any };
    const db = fakeDb({ method: qrMethod });
    const service = build(db, {}, [apiQrProvider(status)]);
    await service.checkout('c1', 'o1');
    await service.assertOfferPaid({ query: db.query } as any, {
      requestId: 'r1',
      offerId: 'o1',
      amount: 150,
    });

    await expect(service.assertOfferAmountEditable('o1', 200)).rejects.toThrow(
      'ya pagó Bs 150',
    );
    await expect(
      service.assertOfferAmountEditable('o1', 150),
    ).resolves.toBeUndefined();
    await expect(
      service.assertOfferAmountEditable('otra', 200),
    ).resolves.toBeUndefined();
  });

  it('efectivo no bloquea la aceptación', async () => {
    const db = fakeDb({ method: null });
    await expect(
      build(db).assertOfferPaid({ query: db.query } as any, {
        requestId: 'r1',
        offerId: 'o1',
        amount: 150,
      }),
    ).resolves.toBeUndefined();
  });

  it('tarjeta: devuelve los datos del Payment Sheet y se confirma con Stripe', async () => {
    const db = fakeDb({
      method: null,
      offer: { payment_method: 'Tarjeta', payment_method_code: 'card' },
      stripeActive: true,
    });
    const stripe = {
      createPaymentIntent: jest.fn().mockResolvedValue({
        paymentIntent: 'pi_123_secret_abc',
        ephemeralKey: 'ek',
        customer: 'cus_1',
        publishableKey: 'pk_test',
        currency: 'usd',
      }),
      getPaymentIntentStatus: jest.fn().mockResolvedValue('succeeded'),
    };
    const service = build(db, stripe);
    const view = await service.checkout('c1', 'o1');
    expect(view).toMatchObject({
      action: 'card_sheet',
      currency: 'USD',
      card: {
        clientSecret: 'pi_123_secret_abc',
        customer: 'cus_1',
        publishableKey: 'pk_test',
      },
      canReportPaid: false,
    });
    // Los montos de Chamba están en bolivianos: Stripe cobra en BOB.
    expect(stripe.createPaymentIntent).toHaveBeenCalledWith(150, 'bob', 'c1');
    expect(db.payments[0].external_id).toBe('pi_123');

    const refreshed = await service.getForClient('c1', view.id!);
    expect(refreshed.status).toBe('paid');
    expect(refreshed.card).toBeNull(); // el secreto ya no se expone
  });
});

describe('PaymentsService · reembolsos', () => {
  const service = (query: jest.Mock, notifications?: any, realtime?: any) =>
    new PaymentsService(
      { query } as any,
      new PaymentProvidersRegistry(new StripeCardProvider({} as any)),
      notifications,
      realtime,
    );

  it('marca para reembolso los pagos de trabajos cancelados y los que no se usaron, y avisa', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        id: 'p1',
        request_id: 'r1',
        client_user_id: 'c1',
        amount: '150.00',
        refund_reason: 'El trabajo se canceló',
        title: 'Pintar sala',
      },
    ]);
    const notifications = {
      notifyPaymentRefund: jest.fn().mockResolvedValue(null),
    };
    const realtime = { emitToAdmins: jest.fn() };

    await expect(
      service(query, notifications, realtime).flagRefunds(),
    ).resolves.toBe(1);

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("SET status = 'refund_pending'");
    expect(sql).toContain("p.status = 'paid'");
    expect(sql).toContain("jr.status = 'cancelled'");
    // Se conserva un único pago: el de la oferta aceptada por ese monto.
    expect(sql).toContain("jo.status = 'accepted'");
    expect(sql).toContain('p2.amount = jo.amount');
    expect(notifications.notifyPaymentRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'c1',
        requestId: 'r1',
        amount: 150,
        stage: 'pending',
      }),
    );
    expect(realtime.emitToAdmins).toHaveBeenCalledWith(
      'payment.refund_pending',
      expect.objectContaining({ paymentId: 'p1' }),
    );
  });

  it('si la revisión falla no rompe el cron', async () => {
    const query = jest.fn().mockRejectedValue(new Error('db down'));
    await expect(service(query).flagRefunds()).resolves.toBe(0);
  });

  it('el admin marca el reembolso como hecho y el cliente recibe el aviso', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      {
        id: 'p1',
        request_id: 'r1',
        client_user_id: 'c1',
        amount: '80',
        title: 'Limpieza',
      },
    ]);
    const notifications = {
      notifyPaymentRefund: jest.fn().mockResolvedValue(null),
    };
    await expect(
      service(query, notifications).adminMarkRefunded(
        'p1',
        'admin-1',
        'Transferencia 123',
      ),
    ).resolves.toEqual({ ok: true, status: 'refunded' });
    expect(String(query.mock.calls[0][0])).toContain(
      "p.status = 'refund_pending'",
    );
    expect(query.mock.calls[0][1]).toEqual([
      'p1',
      'admin-1',
      'Transferencia 123',
    ]);
    expect(notifications.notifyPaymentRefund).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'done', amount: 80 }),
    );
  });

  it('solo se cierra un reembolso que está pendiente', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([]) // el UPDATE no encontró un reembolso pendiente
      .mockResolvedValueOnce([{ id: 'p1', status: 'paid' }]); // el pago sí existe
    await expect(
      service(query).adminMarkRefunded('p1', 'admin-1'),
    ).rejects.toThrow('no tiene un reembolso pendiente');
  });

  it('el admin puede iniciar un reembolso de un pago confirmado (con motivo)', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      {
        id: 'p1',
        request_id: 'r1',
        client_user_id: 'c1',
        amount: '80',
        title: 'Limpieza',
      },
    ]);
    await expect(
      service(query).adminStartRefund('p1', 'admin-1', '  '),
    ).rejects.toThrow('motivo');
    await expect(
      service(query).adminStartRefund(
        'p1',
        'admin-1',
        'Queja resuelta a favor del cliente',
      ),
    ).resolves.toEqual({ ok: true, status: 'refund_pending' });
    expect(String(query.mock.calls[0][0])).toContain("p.status = 'paid'");
  });

  it('el admin puede decidir no reembolsar, dejando el motivo', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ id: 'p1' }]);
    await expect(
      service(query).adminDeclineRefund('p1', 'admin-1', ''),
    ).rejects.toThrow('por qué');
    await expect(
      service(query).adminDeclineRefund(
        'p1',
        'admin-1',
        'El trabajo se hizo completo',
      ),
    ).resolves.toEqual({ ok: true, status: 'refund_declined' });
    expect(String(query.mock.calls[0][0])).toContain(
      "SET status = 'refund_declined'",
    );
  });
});
