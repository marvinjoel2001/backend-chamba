import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AdminAccessGuard,
  UserAccessGuard,
} from '../access/mobile-access.guard';
import { PaymentsService } from './payments.service';

/** Rutas de la app: el contrato está en payment-provider.ts. */
@Controller('mobile/payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @UseGuards(UserAccessGuard)
  @Post('checkout')
  checkout(@Req() req: any, @Body('offerId') offerId: string) {
    return this.payments.checkout(req.principal.id, offerId);
  }

  @UseGuards(UserAccessGuard)
  @Get(':id')
  get(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.getForClient(req.principal.id, id);
  }

  /** Avisos automáticos de pasarelas (cada proveedor valida su firma). */
  @Post('webhooks/:provider')
  webhook(
    @Param('provider') provider: string,
    @Body() body: any,
    @Headers() headers: Record<string, string>,
  ) {
    return this.payments.handleWebhook(provider, body, headers);
  }
}

/**
 * Admin → Pagos. Los pagos solo se confirman con la API del proveedor; aquí
 * se ven y se gestionan los reembolsos.
 */
@UseGuards(AdminAccessGuard)
@Controller('mobile/admin/payments')
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.payments.adminList(status);
  }

  @Get('providers')
  providers() {
    return this.payments.providerOptions();
  }

  @Post(':id/refund')
  startRefund(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason?: string,
  ) {
    return this.payments.adminStartRefund(id, req.principal.id, reason);
  }

  @Post(':id/refund/done')
  markRefunded(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('note') note?: string,
  ) {
    return this.payments.adminMarkRefunded(id, req.principal.id, note);
  }

  @Post(':id/refund/decline')
  declineRefund(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('note') note?: string,
  ) {
    return this.payments.adminDeclineRefund(id, req.principal.id, note);
  }
}
