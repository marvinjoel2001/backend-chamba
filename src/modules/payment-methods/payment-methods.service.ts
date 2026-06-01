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
    return this.paymentMethodRepository.find({
      where,
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
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
