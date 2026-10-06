import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessService } from './access.service';
import { MobileAccessGuard, AdminAccessGuard, UserAccessGuard } from './mobile-access.guard';

@Module({ imports: [JwtModule.register({})], providers: [AccessService, MobileAccessGuard, AdminAccessGuard, UserAccessGuard],
  exports: [AccessService, MobileAccessGuard, AdminAccessGuard, UserAccessGuard] })
export class AccessModule {}
