import { Controller, Get, Post, Body, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { UserAccessGuard } from '../access/mobile-access.guard';
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
  @UseGuards(UserAccessGuard)
  @Post('payment-intent')
  @ApiOperation({ summary: 'Create a payment intent' })
  createPaymentIntent(
    @Req() req: any,
    @Body('amount') amount: number,
    @Body('currency') currency?: string,
    @Body('customerId') customerId?: string,
  ) {
    if (customerId && customerId !== req.principal.id) throw new ForbiddenException();
    return this.stripeService.createPaymentIntent(amount, currency, req.principal.id);
  }
}
