import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  CHAMBA_STRIPE_CURRENCY,
  StripeService,
} from '../stripe/stripe.service';
import {
  PaymentProvider,
  PaymentStatus,
  ProviderCheckout,
  ProviderContext,
  StoredPayment,
} from './payment-provider';

/*
 * Pagos por QR: se conectan como un proveedor más cuando el banco entregue su
 * API. El proveedor genera un QR por cobro (con el monto exacto) en
 * `createCheckout`, y el pago solo pasa a `paid` cuando el banco lo confirma:
 * por `handleWebhook` (validando la firma del banco) y/o `refreshStatus`
 * (consultando el estado). No existe confirmación manual ni "Ya pagué".
 * Si después hay que devolver el dinero, el reembolso aparece en
 * Admin → Pagos → Reembolsos.
 */

/** Tarjeta con Stripe Payment Sheet (config en Admin → Stripe). */
@Injectable()
export class StripeCardProvider implements PaymentProvider {
  readonly key = 'stripe';
  readonly label = 'Tarjeta (Stripe)';

  constructor(private readonly stripe: StripeService) {}

  async createCheckout(ctx: ProviderContext): Promise<ProviderCheckout> {
    // El monto del pago está en la moneda de la oferta (BOB).
    const intent = await this.stripe.createPaymentIntent(
      ctx.amount,
      ctx.currency || CHAMBA_STRIPE_CURRENCY,
      ctx.clientUserId,
    );
    const clientSecret = intent.paymentIntent;
    if (!clientSecret) {
      throw new ServiceUnavailableException(
        'No se pudo iniciar el pago con tarjeta.',
      );
    }
    return {
      action: 'card_sheet',
      status: 'pending',
      currency: intent.currency.toUpperCase(),
      externalId: clientSecret.split('_secret')[0],
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

  constructor(stripe: StripeCardProvider) {
    this.providers = new Map(
      [stripe].map((provider) => [provider.key, provider]),
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
