import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { AccessService } from '../access/access.service';
import { AdminAccessGuard } from '../access/mobile-access.guard';
import { PaymentMethodsService } from './payment-methods.service';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { PaymentMethod } from './entities/payment-method.entity';

@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(
    private readonly paymentMethodsService: PaymentMethodsService,
    private readonly access: AccessService,
  ) {}

  private async isAdmin(authorization?: string): Promise<boolean> {
    const token = authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return false;
    const principal = await this.access.authenticate(token).catch(() => null);
    return principal?.kind === 'admin';
  }

  @UseGuards(AdminAccessGuard)
  @Post()
  async create(
    @Body() createDto: CreatePaymentMethodDto,
  ): Promise<PaymentMethod> {
    return this.paymentMethodsService.create(createDto);
  }

  /**
   * La app recibe solo lo necesario para mostrar la lista: `config` puede
   * tener datos del proveedor y nunca sale del backend salvo para el admin.
   */
  @Get()
  async findAll(
    @Query('includeInactive') includeInactive?: string,
    @Headers('authorization') authorization?: string,
  ): Promise<Partial<PaymentMethod>[]> {
    if (await this.isAdmin(authorization)) {
      return this.paymentMethodsService.findAll(includeInactive === 'true');
    }
    const methods = await this.paymentMethodsService.findAll(false);
    return methods.map((method) => {
      const visible: Partial<PaymentMethod> = { ...method };
      delete visible.config;
      return visible;
    });
  }

  @UseGuards(AdminAccessGuard)
  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PaymentMethod> {
    return this.paymentMethodsService.findOne(id);
  }

  @UseGuards(AdminAccessGuard)
  @Get('code/:code')
  async findByCode(@Param('code') code: string): Promise<PaymentMethod | null> {
    return this.paymentMethodsService.findByCode(code);
  }

  @UseGuards(AdminAccessGuard)
  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdatePaymentMethodDto,
  ): Promise<PaymentMethod> {
    return this.paymentMethodsService.update(id, updateDto);
  }

  @UseGuards(AdminAccessGuard)
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.paymentMethodsService.remove(id);
  }

  @UseGuards(AdminAccessGuard)
  @Post('seed')
  async seed(): Promise<{ message: string }> {
    await this.paymentMethodsService.seedDefaultPaymentMethods();
    return { message: 'Default payment methods seeded successfully' };
  }
}
