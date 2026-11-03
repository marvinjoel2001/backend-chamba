import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type PublicJob = {
  title: string;
  category: string;
  budget: number;
  modality: 'fixed' | 'hourly' | 'daily';
  createdAt: string;
};

const MAX_TITLE = 60;
const DAYS_VISIBLE = 7;

/**
 * Título apto para mostrarse a cualquiera: sin correos ni números largos
 * (teléfonos, carnets, direcciones con número) y corto.
 */
export function publicJobTitle(raw: unknown): string {
  const text = (typeof raw === 'string' ? raw : '')
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '')
    .replace(/\+?\d[\d\s.-]{4,}\d/g, '…')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return 'Trabajo';
  if (text.length <= MAX_TITLE) return text;
  const cut = text.slice(0, MAX_TITLE - 1);
  const atWord = cut.replace(/\s+\S*$/, '');
  return `${(atWord.length > 20 ? atWord : cut).trimEnd()}…`;
}

const modalityOf = (
  modality: unknown,
  priceType: unknown,
): PublicJob['modality'] => {
  if (modality === 'hourly' || modality === 'daily' || modality === 'fixed') {
    return modality;
  }
  const text = (typeof priceType === 'string' ? priceType : '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (text.includes('hora') || text.includes('hour')) return 'hourly';
  if (text.includes('dia') || text.includes('day')) return 'daily';
  return 'fixed';
};

/**
 * Trabajos abiertos para la web pública (para que los trabajadores vean que
 * hay movimiento y descarguen la app). Solo título corto, categoría,
 * presupuesto, modalidad y fecha: nunca dirección, descripción, fotos,
 * ubicación ni datos del cliente.
 */
@Injectable()
export class PublicJobsService {
  constructor(private readonly dataSource: DataSource) {}

  async list(limit = 12): Promise<{ total: number; jobs: PublicJob[] }> {
    const take = Math.min(30, Math.max(1, Math.floor(Number(limit) || 12)));
    const filters = `
      FROM job_requests jr
      JOIN users c ON c.id = jr.client_user_id
      WHERE jr.status IN ('searching', 'negotiating')
        AND jr.created_at > NOW() - make_interval(days => ${DAYS_VISIBLE})
        AND COALESCE(c.is_blocked, false) = false
        AND c.deleted_at IS NULL`;
    const [rows, totals] = await Promise.all([
      this.dataSource.query<any[]>(
        `SELECT jr.title, jr.category, jr.budget::float8 AS budget, jr.modality,
                jr.price_type, jr.created_at
         ${filters}
         ORDER BY jr.created_at DESC
         LIMIT $1`,
        [take],
      ),
      this.dataSource.query<Array<{ total: number }>>(
        `SELECT COUNT(*)::int AS total ${filters}`,
      ),
    ]);
    return {
      total: Number(totals[0]?.total ?? 0),
      jobs: rows.map((row) => ({
        title: publicJobTitle(row.title),
        category: String(row.category ?? 'General'),
        budget: Number(row.budget ?? 0),
        modality: modalityOf(row.modality, row.price_type),
        createdAt: new Date(row.created_at).toISOString(),
      })),
    };
  }
}
