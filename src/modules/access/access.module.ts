import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessService } from './access.service';
import { LoginAttemptsService } from './login-attempts.service';
import { MobileAccessGuard, AdminAccessGuard, UserAccessGuard } from './mobile-access.guard';

@Module({ imports: [JwtModule.register({})],
  providers: [AccessService, LoginAttemptsService, MobileAccessGuard, AdminAccessGuard, UserAccessGuard],
  exports: [AccessService, LoginAttemptsService, MobileAccessGuard, AdminAccessGuard, UserAccessGuard] })
export class AccessModule {}
