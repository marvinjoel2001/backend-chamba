import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export const WORK_MODALITIES = ['fixed', 'hourly', 'daily'] as const;
export type WorkModality = (typeof WORK_MODALITIES)[number];
export type WorkModalitySettings = Record<WorkModality, boolean>;

const CONFIG_KEY = 'work_modalities';

export const WORK_MODALITY_LABELS: Record<WorkModality, string> = {
  fixed: 'Por trabajo',
  hourly: 'Por hora',
  daily: 'Por día',
};

const isModality = (value: unknown): value is WorkModality =>
  typeof value === 'string' &&
  (WORK_MODALITIES as readonly string[]).includes(value);

const parseJson = (value: unknown): Record<string, unknown> => {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const asBoolean = (value: unknown): boolean | undefined =>
  value === true || value === 'true'
    ? true
    : value === false || value === 'false'
      ? false
      : undefined;

/**
 * Modalidades de contratación que ofrece Chamba (por trabajo, por hora, por
 * día). El admin las activa o desactiva: una desactivada deja de aparecer en
 * la app y en la web y no se pueden crear solicitudes nuevas con ella. Las
 * solicitudes que ya existen siguen igual.
 */
@Injectable()
export class WorkModalitiesService {
  constructor(private readonly dataSource: DataSource) {}

  async get(): Promise<WorkModalitySettings> {
    const rows = await this.dataSource.query<Array<{ value_json: unknown }>>(
      `SELECT value_json FROM app_config WHERE key = $1 LIMIT 1`,
      [CONFIG_KEY],
    );
    const stored = parseJson(rows[0]?.value_json);
    // Lo que no está guardado se considera activo (así empieza la plataforma).
    return {
      fixed: stored.fixed !== false,
      hourly: stored.hourly !== false,
      daily: stored.daily !== false,
    };
  }

  async update(input: Partial<Record<WorkModality, unknown>>) {
    const current = await this.get();
    const next = { ...current };
    for (const modality of WORK_MODALITIES) {
      const value = asBoolean(input?.[modality]);
      if (value !== undefined) next[modality] = value;
    }
    if (!WORK_MODALITIES.some((modality) => next[modality])) {
      throw new BadRequestException(
        'Deja al menos una modalidad activa para que se puedan publicar trabajos.',
      );
    }
    await this.dataSource.query(
      `INSERT INTO app_config (key, value_json, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
      [CONFIG_KEY, JSON.stringify(next)],
    );
    return next;
  }

  /** Lanza un error claro si se intenta usar una modalidad desactivada. */
  async assertEnabled(modality: unknown): Promise<void> {
    if (!isModality(modality)) return;
    const settings = await this.get();
    if (!settings[modality]) {
      throw new BadRequestException(
        `La modalidad "${WORK_MODALITY_LABELS[modality]}" no está disponible por ahora. Elige otra.`,
      );
    }
  }

  /** Quita de la lista las modalidades desactivadas. */
  async keepEnabled(modalities: string[]): Promise<string[]> {
    const settings = await this.get();
    return modalities.filter((item) => isModality(item) && settings[item]);
  }
}
