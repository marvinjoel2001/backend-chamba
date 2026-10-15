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
import { AdminAccessGuard, UserAccessGuard } from '../access/mobile-access.guard';
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

  @UseGuards(UserAccessGuard)
  @Post(':id/report')
  report(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.reportPaid(req.principal.id, id);
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

  @Post('qr-image')
  uploadQr(@Body('imageBase64') imageBase64: string) {
    return this.payments.uploadQrImage(imageBase64);
  }

  @Post(':id/confirm')
  confirm(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.adminConfirm(id, req.principal.id);
  }

  @Post(':id/reject')
  reject(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason?: string,
  ) {
    return this.payments.adminReject(id, req.principal.id, reason);
  }
}
