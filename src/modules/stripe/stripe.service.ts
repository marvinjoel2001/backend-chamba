import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  constructor(private readonly dataSource: DataSource) {}

  private async getConfig() {
    const rows = await this.dataSource.query<any[]>(
      `SELECT value_json FROM app_config WHERE key = 'stripe_config' LIMIT 1`,
    );
    if (rows[0] && rows[0].value_json) {
      const val = typeof rows[0].value_json === 'string'
        ? JSON.parse(rows[0].value_json)
        : rows[0].value_json;
      return val;
    }
    return { active: false, secretKey: '', publishableKey: '' };
  }

  async createPaymentIntent(amount: number, currency: string = 'usd', customerId?: string) {
    const config = await this.getConfig();
    if (!config.active || !config.secretKey) {
      throw new InternalServerErrorException('Stripe is not configured or is disabled');
    }

    const stripe = new Stripe(config.secretKey, { apiVersion: '2025-01-27.acacia' });

    // Amount should be in cents
    const amountInCents = Math.round(amount * 100);

    let customer = customerId;
    let ephemeralKey = null;

    // We can generate an ephemeral key if we have a customer
    if (customer) {
      ephemeralKey = await stripe.ephemeralKeys.create(
        { customer: customer },
        { apiVersion: '2025-01-27.acacia' }
      );
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: currency,
      customer: customer,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    return {
      paymentIntent: paymentIntent.client_secret,
      ephemeralKey: ephemeralKey?.secret,
      customer: customer,
      publishableKey: config.publishableKey,
    };
  }

  async getPublishableKey() {
    const config = await this.getConfig();
    return {
      active: config.active,
      publishableKey: config.publishableKey,
    };
  }
}
