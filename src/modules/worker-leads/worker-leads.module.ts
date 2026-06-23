import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkerLeadsService } from './worker-leads.service';
import { WorkerLeadsController } from './worker-leads.controller';
import { WorkerLead } from './entities/worker-lead.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WorkerLead])],
  controllers: [WorkerLeadsController],
  providers: [WorkerLeadsService],
})
export class WorkerLeadsModule {}
