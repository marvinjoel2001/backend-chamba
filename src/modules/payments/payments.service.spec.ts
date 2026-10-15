import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { ManualQrProvider, PaymentProvidersRegistry, StripeCardProvider } from './providers';

/**
 * Base de datos falsa mínima: responde según el SQL y guarda los pagos en
 * memoria para poder seguir el flujo checkout → reportar → aceptar.
 */
function fakeDb(options: {
  method?: { code: string; name: string; config: any; is_active?: boolean } | null;
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
    if (sql.includes('FROM job_offers jo')) return [offer];
    if (sql.includes("key = 'stripe_config'"))
      return [{ value_json: JSON.stringify({ active: options.stripeActive ?? false }) }];
    if (sql.includes('FROM payment_methods'))
      return options.method
        ? [{ ...options.method, config: JSON.stringify(options.method.config), is_active: options.method.is_active ?? true }]
        : [];
    if (sql.includes('SELECT payment_method, payment_method_code FROM job_requests'))
      return [{ payment_method: offer.payment_method, payment_method_code: offer.payment_method_code }];
    if (sql.startsWith('INSERT INTO payments')) {
      const row = {
        id: `p${payments.length + 1}`, request_id: args[0], offer_id: args[1], client_user_id: args[2],
        method_code: args[3], method_name: args[4], provider: args[5], amount: String(args[6]),
        currency: 'BOB', status: 'pending', action: 'none', payload: {}, expires_at: null, external_id: null,
      };
      payments.push(row);
      return [{ id: row.id }];
    }
    if (sql.includes('UPDATE payments') && sql.includes('SET status = $2, action = $3')) {
      const row = payments.find((p) => p.id === args[0]);
      Object.assign(row, {
        status: args[1], action: args[2], currency: args[3], external_id: args[4],
        payload: JSON.parse(args[5]), expires_at: args[6],
      });
      return [row];
    }
    if (sql.includes("SET status = 'reported'")) {
      const row = payments.find((p) => p.id === args[0] && p.status === 'pending');
      if (row) row.status = 'reported';
      return row ? [row] : [];
    }
    if (sql.includes("SET status = 'cancelled'")) {
      payments.filter((p) => p.offer_id === args[0] && p.status === 'pending').forEach((p) => (p.status = 'cancelled'));
      return [];
    }
    if (sql.includes('FROM payments p') && sql.includes('p.offer_id = $1 AND p.provider = $2')) {
      return payments.filter(
        (p) => p.offer_id === args[0] && p.provider === args[1] && Number(p.amount) === Number(args[2])
          && ['pending', 'reported', 'paid'].includes(p.status),
      ).reverse();
    }
    if (sql.includes('FROM payments p') && sql.includes('p.offer_id = $1 AND p.amount = $2')) {
      return payments.filter(
        (p) => p.offer_id === args[0] && Number(p.amount) === Number(args[1])
          && ['pending', 'reported', 'paid'].includes(p.status),
      );
    }
    if (sql.includes('FROM payments p WHERE p.id = $1')) return payments.filter((p) => p.id === args[0]);
    return [];
  });
  return { query, payments };
}

function build(db: ReturnType<typeof fakeDb>, stripe: Record<string, jest.Mock> = {}) {
  const registry = new PaymentProvidersRegistry(
    new ManualQrProvider(),
    new StripeCardProvider(stripe as any),
  );
  return new PaymentsService({ query: db.query } as any, registry, {} as any);
}

const qrMethod = {
  code: 'qr_negocio',
  name: 'QR',
  config: { provider: 'manual_qr', qrImageUrl: 'https://img/qr.png', instructions: 'Paga al QR' },
};

describe('PaymentsService', () => {
  it('efectivo: no pide pago y la app sigue directo', async () => {
    const db = fakeDb({ method: null });
    const view = await build(db).checkout('c1', 'o1');
    expect(view).toMatchObject({ id: null, status: 'not_required', action: 'none', amount: 150 });
    expect(db.payments).toHaveLength(0);
  });

  it('QR fijo: devuelve la imagen, instrucciones y el botón "Ya pagué"', async () => {
    const db = fakeDb({ method: qrMethod });
    const view = await build(db).checkout('c1', 'o1');
    expect(view).toMatchObject({
      status: 'pending',
      action: 'qr',
      amount: 150,
      methodName: 'QR',
      instructions: 'Paga al QR',
      qr: { imageUrl: 'https://img/qr.png', imageBase64: null },
      canReportPaid: true,
      card: null,
    });
    expect(view.pollSeconds).toBeGreaterThan(0);
    expect(view.expiresAt).not.toBeNull();
  });

  it('reutiliza el mismo cobro si se vuelve a abrir (no genera otro QR)', async () => {
    const db = fakeDb({ method: qrMethod });
    const service = build(db);
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

  it('proveedor desconocido o QR sin imagen: error claro, sin romper', async () => {
    const unknown = fakeDb({ method: { ...qrMethod, config: { provider: 'banco_x' } } });
    await expect(build(unknown).checkout('c1', 'o1')).rejects.toThrow(BadRequestException);

    const noImage = fakeDb({ method: { ...qrMethod, config: { provider: 'manual_qr' } } });
    await expect(build(noImage).checkout('c1', 'o1')).rejects.toThrow('no está configurado');
    expect(noImage.query.mock.calls.some(([sql]) => sql.includes("SET status = 'failed'"))).toBe(true);
  });

  it('solo el cliente de la solicitud puede cobrar la oferta', async () => {
    const db = fakeDb({ method: qrMethod });
    await expect(build(db).checkout('otro', 'o1')).rejects.toThrow(ForbiddenException);
  });

  it('aceptar la oferta exige el pago hecho o reportado', async () => {
    const db = fakeDb({ method: qrMethod });
    const service = build(db);
    const runner = { query: db.query } as any;
    const params = { requestId: 'r1', offerId: 'o1', amount: 150 };

    await expect(service.assertOfferPaid(runner, params)).rejects.toThrow('Completa el pago');

    const view = await service.checkout('c1', 'o1');
    await expect(service.assertOfferPaid(runner, params)).rejects.toThrow('Completa el pago');

    const reported = await service.reportPaid('c1', view.id!);
    expect(reported.status).toBe('reported');
    expect(reported.canReportPaid).toBe(false);
    await expect(service.assertOfferPaid(runner, params)).resolves.toBeUndefined();

    // Si el trabajador cambió el monto, el pago anterior ya no alcanza.
    await expect(
      service.assertOfferPaid(runner, { ...params, amount: 200 }),
    ).rejects.toThrow('Completa el pago');
  });

  it('efectivo no bloquea la aceptación', async () => {
    const db = fakeDb({ method: null });
    await expect(
      build(db).assertOfferPaid({ query: db.query } as any, { requestId: 'r1', offerId: 'o1', amount: 150 }),
    ).resolves.toBeUndefined();
  });

  it('tarjeta: devuelve los datos del Payment Sheet y se confirma con Stripe', async () => {
    const db = fakeDb({ method: null, offer: { payment_method: 'Tarjeta', payment_method_code: 'card' }, stripeActive: true });
    const stripe = {
      createPaymentIntent: jest.fn().mockResolvedValue({
        paymentIntent: 'pi_123_secret_abc', ephemeralKey: 'ek', customer: 'cus_1',
        publishableKey: 'pk_test', currency: 'usd',
      }),
      getPaymentIntentStatus: jest.fn().mockResolvedValue('succeeded'),
    };
    const service = build(db, stripe);
    const view = await service.checkout('c1', 'o1');
    expect(view).toMatchObject({
      action: 'card_sheet',
      currency: 'USD',
      card: { clientSecret: 'pi_123_secret_abc', customer: 'cus_1', publishableKey: 'pk_test' },
      canReportPaid: false,
    });
    expect(stripe.createPaymentIntent).toHaveBeenCalledWith(150, undefined, 'c1');
    expect(db.payments[0].external_id).toBe('pi_123');

    const refreshed = await service.getForClient('c1', view.id!);
    expect(refreshed.status).toBe('paid');
    expect(refreshed.card).toBeNull(); // el secreto ya no se expone
  });

  it('"Ya pagué" no existe para pagos automáticos (tarjeta)', async () => {
    const db = fakeDb({ method: null, offer: { payment_method_code: 'card' }, stripeActive: true });
    const stripe = {
      createPaymentIntent: jest.fn().mockResolvedValue({ paymentIntent: 'pi_9_secret_x', currency: 'usd' }),
      getPaymentIntentStatus: jest.fn().mockResolvedValue('requires_payment_method'),
    };
    const service = build(db, stripe);
    const view = await service.checkout('c1', 'o1');
    await expect(service.reportPaid('c1', view.id!)).rejects.toThrow('automáticamente');
  });
});
