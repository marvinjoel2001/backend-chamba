import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('worker_leads')
export class WorkerLead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  fullName: string;

  @Column()
  whatsapp: string;

  @Column({ nullable: true })
  email: string;

  @Column()
  city: string;

  @Column()
  category: string;

  @Column({ default: false })
  isContacted: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
