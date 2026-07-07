import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

export interface AgencyPrincipal {
  agencyId: string;
  name: string;
  contactEmail: string;
}

// Estrategia con nombre propio ('agency-jwt') para no interferir con la
// estrategia 'jwt' del panel admin, que valida contra admin_users.
@Injectable()
export class AgencyJwtStrategy extends PassportStrategy(Strategy, 'agency-jwt') {
  constructor(
    configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'super-secret-key'),
    });
  }

  async validate(payload: any): Promise<AgencyPrincipal> {
    if (payload?.type !== 'agency' || !payload?.sub) {
      throw new UnauthorizedException();
    }

    const rows = await this.dataSource.query<any[]>(
      `
      SELECT id, name, contact_email, is_active
      FROM agencies
      WHERE id = $1
      LIMIT 1
      `,
      [payload.sub],
    );

    const agency = rows[0];
    if (!agency || agency.is_active === false) {
      throw new UnauthorizedException();
    }

    return {
      agencyId: agency.id,
      name: agency.name,
      contactEmail: agency.contact_email,
    };
  }
}
