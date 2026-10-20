import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import Stripe from 'stripe';

/**
 * Todos los montos de Chamba (presupuestos, ofertas, pagos) están en
 * bolivianos. Stripe cobra en esa misma moneda; una moneda guardada en la
 * config (antes se guardaba 'usd' por defecto) cobraría Bs 150 como USD 150.
 */
export const CHAMBA_STRIPE_CURRENCY = 'bob';

@Injectable()
export class StripeService {
  constructor(private readonly dataSource: DataSource) {}

  private async getConfig(): Promise<{
    active: boolean;
    secretKey: string;
    publishableKey: string;
    currency: string;
  }> {
    const rows = await this.dataSource.query<any[]>(
      `SELECT value_json FROM app_config WHERE key = 'stripe_config' LIMIT 1`,
    );
    if (rows[0] && rows[0].value_json) {
      const val =
        typeof rows[0].value_json === 'string'
          ? JSON.parse(rows[0].value_json)
          : rows[0].value_json;
      return {
        active: val?.active === true,
        secretKey: val?.secretKey ?? '',
        publishableKey: val?.publishableKey ?? '',
        currency: CHAMBA_STRIPE_CURRENCY,
      };
    }
    return {
      active: false,
      secretKey: '',
      publishableKey: '',
      currency: CHAMBA_STRIPE_CURRENCY,
    };
  }

  /**
   * El customerId que manda la app es el UUID interno de Chamba, no un id de
   * Stripe. Aquí se resuelve al customer real de Stripe (buscando por
   * metadata) y se crea si no existe, para poder emitir ephemeral keys y que
   * el Payment Sheet recuerde tarjetas del usuario.
   */
  private async resolveStripeCustomer(
    stripe: Stripe,
    appUserId?: string,
  ): Promise<string | undefined> {
    if (!appUserId) return undefined;
    if (appUserId.startsWith('cus_')) return appUserId;

    try {
      const found = await stripe.customers.search({
        query: `metadata['appUserId']:'${appUserId.replace(/'/g, '')}'`,
        limit: 1,
      });
      if (found.data[0]) return found.data[0].id;

      const created = await stripe.customers.create({
        metadata: { appUserId },
      });
      return created.id;
    } catch {
      // Si la búsqueda/creación falla, se cobra sin customer (sin tarjetas
      // guardadas) en vez de romper el pago.
      return undefined;
    }
  }

  async createPaymentIntent(
    amount: number,
    currency?: string,
    customerId?: string,
  ) {
    const config = await this.getConfig();
    if (!config.active || !config.secretKey) {
      throw new InternalServerErrorException(
        'Stripe is not configured or is disabled',
      );
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new InternalServerErrorException('Invalid amount');
    }

    // Sin apiVersion explícita: usa la versión fijada por el SDK instalado.
    const stripe = new Stripe(config.secretKey);

    const resolvedCurrency = (currency || config.currency).toLowerCase();
    // Stripe cobra en la unidad mínima (centavos).
    const amountInCents = Math.round(amount * 100);

    const customer = await this.resolveStripeCustomer(stripe, customerId);

    let ephemeralKey: Stripe.EphemeralKey | null = null;
    if (customer) {
      ephemeralKey = await stripe.ephemeralKeys.create(
        { customer },
        { apiVersion: '2025-01-27.acacia' },
      );
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: resolvedCurrency,
      customer,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: customerId ? { appUserId: customerId } : undefined,
    });

    return {
      paymentIntent: paymentIntent.client_secret,
      ephemeralKey: ephemeralKey?.secret ?? null,
      customer: customer ?? null,
      publishableKey: config.publishableKey,
      currency: resolvedCurrency,
    };
  }

  /** Estado real de un PaymentIntent (para confirmar el pago en el backend). */
  async getPaymentIntentStatus(paymentIntentId: string): Promise<string | null> {
    const config = await this.getConfig();
    if (!config.secretKey || !paymentIntentId) return null;
    const stripe = new Stripe(config.secretKey);
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return intent.status;
  }

  async getPublishableKey() {
    const config = await this.getConfig();
    return {
      active: config.active,
      publishableKey: config.publishableKey,
    };
  }
}
