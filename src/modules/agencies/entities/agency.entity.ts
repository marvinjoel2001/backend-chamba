import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@Entity({ name: 'agencies' })
export class Agency {
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'Agencia CleanPro' })
  @Column({ name: 'name' })
  name: string;

  @ApiPropertyOptional({ example: '123456789' })
  @Column({ name: 'tax_id', nullable: true })
  taxId?: string;

  @ApiProperty({ example: 'contacto@cleanpro.com' })
  @Column({ name: 'contact_email' })
  contactEmail: string;

  @ApiPropertyOptional({ example: '70000000' })
  @Column({ name: 'contact_phone', nullable: true })
  contactPhone?: string;

  @ApiProperty({ example: 10.5 })
  @Column({ name: 'commission_rate', type: 'float', default: 0 })
  commissionRate: number;

  @Column({ name: 'password_hash', nullable: true, select: false })
  passwordHash?: string;

  @ApiProperty({ example: true })
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @ApiProperty({ type: String, example: '2026-03-08T22:42:26.170Z' })
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty({ type: String, example: '2026-03-08T22:42:26.170Z' })
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
