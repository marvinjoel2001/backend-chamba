import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RealtimeModule } from '../realtime/realtime.module';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), RealtimeModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
