import { BadRequestException, Injectable, Logger, OnApplicationBootstrap, Optional, UnauthorizedException } from '@nestjs/common';
import { LoginAttemptsService } from '../../access/login-attempts.service';
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
    @Optional() private readonly loginAttempts?: LoginAttemptsService,
  ) {}

  async onApplicationBootstrap() {
    await this.seedDefaultAgency();
  }

  private async seedDefaultAgency() {
    try {
      // Solo se crea una agencia por defecto si se configura explícitamente:
      // nunca con credenciales conocidas, porque este backend corre en producción.
      const email = process.env.DEFAULT_AGENCY_EMAIL?.trim();
      const password = process.env.DEFAULT_AGENCY_PASSWORD;
      const name = process.env.DEFAULT_AGENCY_NAME ?? 'Agencia';
      if (!email || !password || password.length < 8) return;

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
    // 5 intentos fallidos bloquean ese correo 15 minutos.
    const attemptsKey = String(loginDto.email ?? '').trim().toLowerCase();
    await this.loginAttempts?.assertAllowed('agency', attemptsKey);
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT id, name, contact_email, contact_phone, commission_rate, password_hash, is_active,
             must_change_password
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

    if (!agency || !passwordOk) {
      const remaining = await this.loginAttempts?.recordFailure('agency', attemptsKey);
      throw new UnauthorizedException(remaining === undefined ? 'Credenciales inválidas'
        : this.loginAttempts!.invalidCredentialsMessage('agency', remaining, 'Credenciales inválidas'));
    }
    if (agency.is_active === false) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    await this.loginAttempts?.reset('agency', attemptsKey);

    const payload = { sub: agency.id, type: 'agency', name: agency.name };

    return {
      access_token: this.jwtService.sign(payload),
      agency: {
        id: agency.id,
        name: agency.name,
        contactEmail: agency.contact_email,
        contactPhone: agency.contact_phone ?? null,
        commissionRate: Number(agency.commission_rate ?? 0),
        mustChangePassword: agency.must_change_password === true,
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
    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException(
        'Elige una contraseña nueva, distinta de la actual',
      );
    }

    const newHash = await bcrypt.hash(dto.newPassword, await bcrypt.genSalt());
    await this.dataSource.query(
      `UPDATE agencies
       SET password_hash = $2, must_change_password = false, updated_at = NOW()
       WHERE id = $1`,
      [agencyId, newHash],
    );

    return { message: 'Contraseña actualizada correctamente' };
  }

  async getProfile(agencyId: string) {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT id, name, tax_id, contact_email, contact_phone, commission_rate, created_at,
             must_change_password
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
      mustChangePassword: agency.must_change_password === true,
      createdAt: agency.created_at,
    };
  }
}
