import { Controller, Get } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

/**
 * Los cobros con tarjeta se crean solo desde el checkout de una oferta
 * (PaymentsService → StripeCardProvider), con el monto de la oferta. Ya no
 * existe un endpoint para crear PaymentIntents sueltos con monto libre.
 */
@ApiTags('Mobile Stripe')
@Controller('mobile/stripe')
export class StripeController {
  constructor(private readonly stripeService: StripeService) {}

  @Get('config')
  @ApiOperation({ summary: 'Get Stripe configuration (publishable key)' })
  getConfig() {
    return this.stripeService.getPublishableKey();
  }
}
