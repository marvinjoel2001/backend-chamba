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
} from '@nestjs/common';
import { PaymentMethodsService } from './payment-methods.service';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { PaymentMethod } from './entities/payment-method.entity';

@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(
    private readonly paymentMethodsService: PaymentMethodsService,
  ) {}

  @Post()
  async create(
    @Body() createDto: CreatePaymentMethodDto,
  ): Promise<PaymentMethod> {
    return this.paymentMethodsService.create(createDto);
  }

  @Get()
  async findAll(
    @Query('includeInactive') includeInactive?: string,
  ): Promise<PaymentMethod[]> {
    return this.paymentMethodsService.findAll(includeInactive === 'true');
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PaymentMethod> {
    return this.paymentMethodsService.findOne(id);
  }

  @Get('code/:code')
  async findByCode(
    @Param('code') code: string,
  ): Promise<PaymentMethod | null> {
    return this.paymentMethodsService.findByCode(code);
  }

  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdatePaymentMethodDto,
  ): Promise<PaymentMethod> {
    return this.paymentMethodsService.update(id, updateDto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.paymentMethodsService.remove(id);
  }

  @Post('seed')
  async seed(): Promise<{ message: string }> {
    await this.paymentMethodsService.seedDefaultPaymentMethods();
    return { message: 'Default payment methods seeded successfully' };
  }
}
