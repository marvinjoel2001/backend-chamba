import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MobileRequestRepository } from '../shared/mobile-request.repository';

@Injectable()
export class MobileCatalogService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly repo: MobileRequestRepository,
  ) {}

  public async listCategories() {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT id,
             name,
             description,
             icon,
             parent_id,
             is_active,
             created_at,
             updated_at
      FROM categories
      WHERE is_active = true
      ORDER BY name ASC
      `,
    );

    return {
      categories: rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description ?? '',
        icon: row.icon ?? null,
        parentId: row.parent_id ?? null,
        active: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    };
  }

  public async listAllCategories() {
    const rows = await this.dataSource.query<any[]>(
      `SELECT id, name, description, icon, parent_id, is_active, created_at, updated_at FROM categories ORDER BY name ASC`,
    );
    return {
      categories: rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description ?? '',
        icon: row.icon ?? null,
        parentId: row.parent_id ?? null,
        active: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    };
  }

  public async createCategory(input: {
    id?: string;
    name: string;
    description?: string;
    icon?: string;
    parentId?: string;
    active?: boolean;
  }) {
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('name is required');
    }

    const id = (input.id?.trim() || this.repo.toCategoryId(name)).toLowerCase();
    if (!/^[a-z0-9_]+$/.test(id)) {
      throw new BadRequestException(
        'id must contain only lowercase letters, numbers and underscore',
      );
    }

    if (input.parentId?.trim()) {
      const parentRows = await this.dataSource.query<any[]>(
        `SELECT id FROM categories WHERE id = $1 LIMIT 1`,
        [input.parentId.trim().toLowerCase()],
      );
      if (!parentRows[0]) {
        throw new BadRequestException('parentId not found');
      }
    }

    const rows = await this.dataSource.query<any[]>(
      `
      INSERT INTO categories (id, name, description, icon, parent_id, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id)
      DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        icon = EXCLUDED.icon,
        parent_id = EXCLUDED.parent_id,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id, name, description, icon, parent_id, is_active, created_at, updated_at
      `,
      [
        id,
        name,
        input.description?.trim() || '',
        input.icon?.trim() || null,
        input.parentId?.trim().toLowerCase() || null,
        input.active ?? true,
      ],
    );

    return {
      category: {
        id: rows[0].id,
        name: rows[0].name,
        description: rows[0].description ?? '',
        icon: rows[0].icon ?? null,
        parentId: rows[0].parent_id ?? null,
        active: rows[0].is_active,
        createdAt: rows[0].created_at,
        updatedAt: rows[0].updated_at,
      },
    };
  }

  public async updateCategory(params: {
    id: string;
    name?: string;
    description?: string;
    icon?: string;
    active?: boolean;
  }) {
    const sets: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (params.name !== undefined) {
      sets.push(`name = $${idx++}`);
      values.push(params.name.trim());
    }
    if (params.description !== undefined) {
      sets.push(`description = $${idx++}`);
      values.push(params.description.trim());
    }
    if (params.icon !== undefined) {
      sets.push(`icon = $${idx++}`);
      values.push(params.icon.trim() || null);
    }
    if (params.active !== undefined) {
      sets.push(`is_active = $${idx++}`);
      values.push(params.active);
    }

    if (sets.length === 0) throw new BadRequestException('No fields to update');

    sets.push(`updated_at = NOW()`);
    values.push(params.id);

    await this.dataSource.query(
      `UPDATE categories SET ${sets.join(', ')} WHERE id = $${idx}`,
      values,
    );

    const rows = await this.dataSource.query<any[]>(
      `SELECT id, name, description, icon, is_active, parent_id, created_at, updated_at
       FROM categories WHERE id = $1`,
      [params.id],
    );

    if (!rows[0]) throw new NotFoundException('Category not found');

    return {
      category: {
        id: rows[0].id,
        name: rows[0].name,
        description: rows[0].description ?? '',
        icon: rows[0].icon ?? null,
        parentId: rows[0].parent_id ?? null,
        active: rows[0].is_active,
        createdAt: rows[0].created_at,
        updatedAt: rows[0].updated_at,
      },
    };
  }

  public async deleteCategory(categoryId: string) {
    await this.dataSource.query(
      `UPDATE categories SET is_active = false, updated_at = NOW() WHERE id = $1`,
      [categoryId],
    );
    return { deleted: true, categoryId };
  }

  public async listFallbackCategories() {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT name
      FROM categories
      WHERE is_active = true
      ORDER BY name ASC
      LIMIT 8
      `,
    );

    return rows.map((row) => String(row.name ?? '').trim()).filter(Boolean);
  }
}
