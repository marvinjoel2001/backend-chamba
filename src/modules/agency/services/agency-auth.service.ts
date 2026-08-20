import { Injectable, Logger, OnApplicationBootstrap, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AgencyLoginDto } from '../dto/agency-login.dto';
import { AgencyChangePasswordDto } from '../dto/agency-change-password.dto';

@Injectable()
export class AgencyAuthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AgencyAuthService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
  ) {}

  async onApplicationBootstrap() {
    await this.seedDefaultAgency();
  }

  private async seedDefaultAgency() {
    try {
      const email = process.env.DEFAULT_AGENCY_EMAIL ?? 'agencia@chamba.com';
      const password = process.env.DEFAULT_AGENCY_PASSWORD ?? 'agencia123';
      const name = process.env.DEFAULT_AGENCY_NAME ?? 'Agencia Demo';

      const existing = await this.dataSource.query<any[]>(
        `SELECT id, password_hash FROM agencies WHERE LOWER(contact_email) = LOWER($1) LIMIT 1`,
        [email],
      );

      if (!existing[0]) {
        const passwordHash = await bcrypt.hash(password, await bcrypt.genSalt());
        await this.dataSource.query(
          `
          INSERT INTO agencies (name, contact_email, password_hash, is_active)
          VALUES ($1, $2, $3, true)
          `,
          [name, email, passwordHash],
        );
        this.logger.log(`Agencia por defecto creada: ${email}`);
      } else if (!existing[0].password_hash) {
        const passwordHash = await bcrypt.hash(password, await bcrypt.genSalt());
        await this.dataSource.query(
          `UPDATE agencies SET password_hash = $2, is_active = true WHERE id = $1`,
          [existing[0].id, passwordHash],
        );
        this.logger.log(`Contraseña de agencia actualizada para: ${email}`);
      }
    } catch (err) {
      this.logger.warn(`No se pudo auto-seed agencia por defecto: ${err}`);
    }
  }

  async login(loginDto: AgencyLoginDto) {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT id, name, contact_email, contact_phone, commission_rate, password_hash, is_active
      FROM agencies
      WHERE LOWER(contact_email) = LOWER($1)
      LIMIT 1
      `,
      [loginDto.email],
    );

    const agency = rows[0];
    const passwordOk =
      agency?.password_hash &&
      (await bcrypt.compare(loginDto.password, agency.password_hash));

    if (!agency || !passwordOk || agency.is_active === false) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload = { sub: agency.id, type: 'agency', name: agency.name };

    return {
      access_token: this.jwtService.sign(payload),
      agency: {
        id: agency.id,
        name: agency.name,
        contactEmail: agency.contact_email,
        contactPhone: agency.contact_phone ?? null,
        commissionRate: Number(agency.commission_rate ?? 0),
      },
    };
  }

  async changePassword(agencyId: string, dto: AgencyChangePasswordDto) {
    const rows = await this.dataSource.query<any[]>(
      `SELECT password_hash FROM agencies WHERE id = $1 LIMIT 1`,
      [agencyId],
    );

    const currentHash = rows[0]?.password_hash;
    const currentOk =
      currentHash && (await bcrypt.compare(dto.currentPassword, currentHash));
    if (!currentOk) {
      throw new UnauthorizedException('La contraseña actual es incorrecta');
    }

    const newHash = await bcrypt.hash(dto.newPassword, await bcrypt.genSalt());
    await this.dataSource.query(
      `UPDATE agencies SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
      [agencyId, newHash],
    );

    return { message: 'Contraseña actualizada correctamente' };
  }

  async getProfile(agencyId: string) {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT id, name, tax_id, contact_email, contact_phone, commission_rate, created_at
      FROM agencies
      WHERE id = $1
      LIMIT 1
      `,
      [agencyId],
    );

    const agency = rows[0];
    if (!agency) {
      throw new UnauthorizedException();
    }

    return {
      id: agency.id,
      name: agency.name,
      taxId: agency.tax_id ?? null,
      contactEmail: agency.contact_email,
      contactPhone: agency.contact_phone ?? null,
      commissionRate: Number(agency.commission_rate ?? 0),
      createdAt: agency.created_at,
    };
  }
}
