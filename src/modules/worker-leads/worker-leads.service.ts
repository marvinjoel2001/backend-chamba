import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkerLead } from './entities/worker-lead.entity';
import { CreateWorkerLeadDto } from './dto/create-worker-lead.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class WorkerLeadsService {
  constructor(
    @InjectRepository(WorkerLead)
    private readonly workerLeadRepository: Repository<WorkerLead>,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async create(createDto: CreateWorkerLeadDto): Promise<WorkerLead> {
    const lead = this.workerLeadRepository.create(createDto);
    const saved = await this.workerLeadRepository.save(lead);
    this.realtimeGateway.emitToAdmins('lead.new', saved);
    return saved;
  }

  async findAll(): Promise<WorkerLead[]> {
    return this.workerLeadRepository.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async markAsContacted(id: string): Promise<WorkerLead> {
    const lead = await this.workerLeadRepository.findOne({ where: { id } });
    if (!lead) {
      throw new NotFoundException(`Worker lead with id ${id} not found`);
    }

    lead.isContacted = true;
    const saved = await this.workerLeadRepository.save(lead);
    this.realtimeGateway.emitToAdmins('lead.contacted', saved);
    return saved;
  }
}
