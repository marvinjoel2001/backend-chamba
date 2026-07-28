import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentMethod } from './entities/payment-method.entity';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';

@Injectable()
export class PaymentMethodsService {
  constructor(
    @InjectRepository(PaymentMethod)
    private readonly paymentMethodRepository: Repository<PaymentMethod>,
  ) {}

  async create(createDto: CreatePaymentMethodDto): Promise<PaymentMethod> {
    const paymentMethod = this.paymentMethodRepository.create(createDto);
    return this.paymentMethodRepository.save(paymentMethod);
  }

  async findAll(includeInactive = false): Promise<PaymentMethod[]> {
    const where = includeInactive ? {} : { isActive: true };
    const methods = await this.paymentMethodRepository.find({
      where,
      order: { sortOrder: 'ASC', name: 'ASC' },
    });

    if (!includeInactive) {
      const rows = await this.paymentMethodRepository.manager.query(
        `SELECT value_json FROM app_config WHERE key = 'stripe_config' LIMIT 1`,
      );
      if (rows[0]) {
        const val =
          typeof rows[0].value_json === 'string'
            ? JSON.parse(rows[0].value_json)
            : rows[0].value_json;
        if (val && val.active) {
          const cardMethod = new PaymentMethod();
          cardMethod.id = 'stripe-card';
          cardMethod.name = 'Tarjeta';
          cardMethod.code = 'card';
          cardMethod.description = 'Paga de forma segura con tarjeta';
          cardMethod.icon = 'credit-card';
          cardMethod.color = '#5469d4'; // Stripe blurple
          cardMethod.isActive = true;
          cardMethod.sortOrder = 2;
          methods.push(cardMethod);
        }
      }
    }

    return methods;
  }

  async findOne(id: string): Promise<PaymentMethod> {
    const paymentMethod = await this.paymentMethodRepository.findOne({
      where: { id },
    });
    if (!paymentMethod) {
      throw new NotFoundException(`Payment method with ID ${id} not found`);
    }
    return paymentMethod;
  }

  async findByCode(code: string): Promise<PaymentMethod | null> {
    return this.paymentMethodRepository.findOne({
      where: { code, isActive: true },
    });
  }

  async update(
    id: string,
    updateDto: UpdatePaymentMethodDto,
  ): Promise<PaymentMethod> {
    const paymentMethod = await this.findOne(id);
    Object.assign(paymentMethod, updateDto);
    return this.paymentMethodRepository.save(paymentMethod);
  }

  async remove(id: string): Promise<void> {
    const paymentMethod = await this.findOne(id);
    await this.paymentMethodRepository.remove(paymentMethod);
  }

  async seedDefaultPaymentMethods(): Promise<void> {
    const defaultMethods = [
      {
        name: 'Efectivo',
        code: 'cash',
        description: 'Pago en efectivo al momento del servicio',
        icon: 'money-bill',
        color: '#4CAF50',
        isActive: true,
        sortOrder: 1,
      },
    ];

    for (const method of defaultMethods) {
      const existing = await this.paymentMethodRepository.findOne({
        where: { code: method.code },
      });
      if (!existing) {
        await this.paymentMethodRepository.save(
          this.paymentMethodRepository.create(method),
        );
      }
    }
  }
}
