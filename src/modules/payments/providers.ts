import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { StripeService } from '../stripe/stripe.service';
import {
  PaymentProvider,
  PaymentStatus,
  ProviderCheckout,
  ProviderContext,
  StoredPayment,
} from './payment-provider';

/**
 * QR fijo que sube el admin (el QR de cobro de la cuenta del negocio).
 * El cliente paga desde su banco y toca "Ya pagué"; el admin lo confirma en
 * el panel. config: { qrImageUrl, instructions?, currency?, expiresMinutes? }
 */
@Injectable()
export class ManualQrProvider implements PaymentProvider {
  readonly key = 'manual_qr';
  readonly label = 'QR fijo (confirmación manual)';

  async createCheckout(ctx: ProviderContext): Promise<ProviderCheckout> {
    const imageUrl = String(ctx.config.qrImageUrl ?? '').trim();
    if (!imageUrl) {
      throw new ServiceUnavailableException(
        'Este método de pago aún no está configurado. Elige otro.',
      );
    }
    const minutes = Number(ctx.config.expiresMinutes) || 30;
    return {
      action: 'qr',
      status: 'pending',
      currency: String(ctx.config.currency || ctx.currency || 'BOB').toUpperCase(),
      expiresAt: new Date(Date.now() + minutes * 60_000),
      canReportPaid: true,
      // Se consulta para enterarse cuando el admin confirma.
      pollSeconds: 6,
      payload: {
        instructions:
          String(ctx.config.instructions ?? '').trim() ||
          'Escanea el QR desde la app de tu banco, paga el monto exacto y toca "Ya pagué".',
        qr: { imageUrl, imageBase64: null },
      },
    };
  }
}

/** Tarjeta con Stripe Payment Sheet (config en Admin → Stripe). */
@Injectable()
export class StripeCardProvider implements PaymentProvider {
  readonly key = 'stripe';
  readonly label = 'Tarjeta (Stripe)';

  constructor(private readonly stripe: StripeService) {}

  async createCheckout(ctx: ProviderContext): Promise<ProviderCheckout> {
    const intent = await this.stripe.createPaymentIntent(
      ctx.amount,
      undefined,
      ctx.clientUserId,
    );
    const clientSecret = intent.paymentIntent;
    if (!clientSecret) {
      throw new ServiceUnavailableException('No se pudo iniciar el pago con tarjeta.');
    }
    return {
      action: 'card_sheet',
      status: 'pending',
      currency: intent.currency.toUpperCase(),
      externalId: clientSecret.split('_secret')[0],
      canReportPaid: false,
      pollSeconds: 0,
      payload: {
        card: {
          clientSecret,
          ephemeralKey: intent.ephemeralKey,
          customer: intent.customer,
          publishableKey: intent.publishableKey || null,
        },
      },
    };
  }

  async refreshStatus(payment: StoredPayment): Promise<PaymentStatus | null> {
    if (!payment.external_id) return null;
    const status = await this.stripe
      .getPaymentIntentStatus(payment.external_id)
      .catch(() => null);
    if (status === 'succeeded') return 'paid';
    if (status === 'canceled') return 'cancelled';
    return null;
  }
}

/** Todos los proveedores disponibles. Uno nuevo se agrega aquí. */
@Injectable()
export class PaymentProvidersRegistry {
  private readonly providers: Map<string, PaymentProvider>;

  constructor(manualQr: ManualQrProvider, stripe: StripeCardProvider) {
    this.providers = new Map(
      [manualQr, stripe].map((provider) => [provider.key, provider]),
    );
  }

  get(key: string): PaymentProvider | undefined {
    return this.providers.get(key);
  }

  list(): Array<{ key: string; label: string }> {
    return [
      { key: 'none', label: 'Sin cobro en la app (efectivo / al terminar)' },
      ...[...this.providers.values()].map(({ key, label }) => ({ key, label })),
    ];
  }
}
