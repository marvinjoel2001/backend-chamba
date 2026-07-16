import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Mobile Stripe')
@Controller('mobile/stripe')
export class StripeController {
  constructor(private readonly stripeService: StripeService) {}

  @Get('config')
  @ApiOperation({ summary: 'Get Stripe configuration (publishable key)' })
  getConfig() {
    return this.stripeService.getPublishableKey();
  }

  @Post('payment-intent')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a payment intent' })
  createPaymentIntent(
    @Body('amount') amount: number,
    @Body('currency') currency?: string,
    @Body('customerId') customerId?: string,
  ) {
    return this.stripeService.createPaymentIntent(amount, currency, customerId);
  }
}
