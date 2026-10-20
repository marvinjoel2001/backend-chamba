import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AccessModule } from '../access/access.module';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    RealtimeModule,
    NotificationsModule,
    AccessModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
