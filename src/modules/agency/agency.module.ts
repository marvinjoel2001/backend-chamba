import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MobileModule } from '../mobile/mobile.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AgencyAuthController } from './controllers/agency-auth.controller';
import { AgencyController } from './controllers/agency.controller';
import { AdminAgenciesController } from './controllers/admin-agencies.controller';
import { AgencyAuthService } from './services/agency-auth.service';
import { AgencyService } from './services/agency.service';
import { AdminAgenciesService } from './services/admin-agencies.service';
import { AgencyJwtStrategy } from './strategies/agency-jwt.strategy';

// Módulo B2B aislado para el panel de agencias (agency-chamba).
// No altera el flujo P2P: reutiliza MobileOffersService para que las
// ofertas de agencia pasen por el mismo pipeline que las de la app móvil.
// AdminAgenciesController expone el CRUD de agencias al panel admin
// (protegido con el JWT de admin_users, no el de agencias).
@Module({
  imports: [
    MobileModule,
    NotificationsModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'super-secret-key'),
        signOptions: { expiresIn: '1d' },
      }),
    }),
  ],
  controllers: [
    AgencyAuthController,
    AgencyController,
    AdminAgenciesController,
  ],
  providers: [
    AgencyAuthService,
    AgencyService,
    AdminAgenciesService,
    AgencyJwtStrategy,
  ],
})
export class AgencyModule {}
