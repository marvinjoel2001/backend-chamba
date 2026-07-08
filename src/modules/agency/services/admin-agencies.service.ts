import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { CreateAgencyDto, UpdateAgencyDto } from '../dto/create-agency.dto';

// Gestión de agencias desde el panel admin (admin-chamba).
@Injectable()
export class AdminAgenciesService {
  constructor(private readonly dataSource: DataSource) {}

  public async findAll() {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT a.id,
             a.name,
             a.tax_id,
             a.contact_email,
             a.contact_phone,
             a.commission_rate,
             a.is_active,
             a.created_at,
             (SELECT COUNT(*) FROM users u
              WHERE u.agency_id = a.id AND u.is_agency_worker = true) AS workers_count,
             (SELECT COUNT(*) FROM job_offers jo
              WHERE jo.offered_by_agency_id = a.id) AS offers_count,
             (SELECT COUNT(*) FROM job_offers jo
              WHERE jo.offered_by_agency_id = a.id AND jo.status = 'accepted') AS offers_accepted_count
      FROM agencies a
      ORDER BY a.created_at DESC
      `,
    );

    return rows.map((row) => this.mapAgency(row));
  }

  public async create(dto: CreateAgencyDto) {
    const existing = await this.dataSource.query<any[]>(
      `SELECT id FROM agencies WHERE LOWER(contact_email) = LOWER($1) LIMIT 1`,
      [dto.contactEmail],
    );
    if (existing[0]) {
      throw new ConflictException('Ya existe una agencia con ese email');
    }

    const passwordHash = await bcrypt.hash(
      dto.password,
      await bcrypt.genSalt(),
    );

    const rows = await this.dataSource.query<any[]>(
      `
      INSERT INTO agencies (name, contact_email, contact_phone, tax_id, commission_rate, password_hash, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, true)
      RETURNING id, name, tax_id, contact_email, contact_phone, commission_rate, is_active, created_at
      `,
      [
        dto.name,
        dto.contactEmail,
        dto.contactPhone ?? null,
        dto.taxId ?? null,
        dto.commissionRate ?? 0,
        passwordHash,
      ],
    );

    return this.mapAgency({ ...rows[0], workers_count: 0, offers_count: 0, offers_accepted_count: 0 });
  }

  public async update(agencyId: string, dto: UpdateAgencyDto) {
    const existing = await this.dataSource.query<any[]>(
      `SELECT id FROM agencies WHERE id = $1 LIMIT 1`,
      [agencyId],
    );
    if (!existing[0]) {
      throw new NotFoundException('Agencia no encontrada');
    }

    if (dto.contactEmail) {
      const emailTaken = await this.dataSource.query<any[]>(
        `SELECT id FROM agencies WHERE LOWER(contact_email) = LOWER($1) AND id <> $2 LIMIT 1`,
        [dto.contactEmail, agencyId],
      );
      if (emailTaken[0]) {
        throw new ConflictException('Ya existe otra agencia con ese email');
      }
    }

    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, await bcrypt.genSalt())
      : null;

    // Para UPDATE ... RETURNING, dataSource.query devuelve [rows, affected].
    const [rows] = await this.dataSource.query<[any[], number]>(
      `
      UPDATE agencies
      SET name = COALESCE($2, name),
          contact_email = COALESCE($3, contact_email),
          contact_phone = COALESCE($4, contact_phone),
          tax_id = COALESCE($5, tax_id),
          commission_rate = COALESCE($6, commission_rate),
          is_active = COALESCE($7, is_active),
          password_hash = COALESCE($8, password_hash),
          updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, tax_id, contact_email, contact_phone, commission_rate, is_active, created_at
      `,
      [
        agencyId,
        dto.name ?? null,
        dto.contactEmail ?? null,
        dto.contactPhone ?? null,
        dto.taxId ?? null,
        dto.commissionRate ?? null,
        dto.isActive ?? null,
        passwordHash,
      ],
    );

    return this.mapAgency(rows[0]);
  }

  private mapAgency(row: any) {
    return {
      id: row.id,
      name: row.name,
      taxId: row.tax_id ?? null,
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone ?? null,
      commissionRate: Number(row.commission_rate ?? 0),
      isActive: row.is_active !== false,
      createdAt: row.created_at,
      workersCount: Number(row.workers_count ?? 0),
      offersCount: Number(row.offers_count ?? 0),
      offersAcceptedCount: Number(row.offers_accepted_count ?? 0),
    };
  }

  public async remove(agencyId: string) {
    const existing = await this.dataSource.query<any[]>(
      `SELECT id FROM agencies WHERE id = $1 LIMIT 1`,
      [agencyId],
    );
    if (!existing[0]) {
      throw new NotFoundException('Agencia no encontrada');
    }

    try {
      await this.dataSource.query(
        `DELETE FROM agencies WHERE id = $1`,
        [agencyId],
      );
    } catch (e: any) {
      if (e.code === '23503') {
        throw new ConflictException('No se puede eliminar la agencia porque tiene trabajadores u ofertas asociadas.');
      }
      throw e;
    }
  }
}
