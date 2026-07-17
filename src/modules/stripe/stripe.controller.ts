import { Controller, Get, Post, Body } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Mobile Stripe')
@Controller('mobile/stripe')
export class StripeController {
  constructor(private readonly stripeService: StripeService) {}

  @Get('config')
  @ApiOperation({ summary: 'Get Stripe configuration (publishable key)' })
  getConfig() {
    return this.stripeService.getPublishableKey();
  }

  // Sin guard: la app móvil no maneja JWT todavía (mismo modelo que el resto
  // de endpoints /mobile/*). El JwtAuthGuard anterior era el del panel admin
  // y hacía que la app recibiera 401 siempre.
  @Post('payment-intent')
  @ApiOperation({ summary: 'Create a payment intent' })
  createPaymentIntent(
    @Body('amount') amount: number,
    @Body('currency') currency?: string,
    @Body('customerId') customerId?: string,
  ) {
    return this.stripeService.createPaymentIntent(amount, currency, customerId);
  }
}
