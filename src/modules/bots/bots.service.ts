import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { BotProfileDto, BotSettingsDto } from './bots.dto';
import { NEXT_STATE, randomPoint } from './bots.geometry';
import type { Point } from './bots.geometry';

type Settings = Point & {
  state: 'off' | 'running' | 'pausing' | 'paused';
  generation: number;
  zone_configured: boolean;
  center_mode: string;
  radius_km: number;
  interval_seconds: number;
  step_seconds: number;
  max_concurrent: number;
  daily_limit: number;
  should_start: boolean;
};
type Anchor = Point & { id: string; name: string; updatedAt: string };

const SPECIALTIES = [
  'Limpieza',
  'Limpieza',
  'Limpieza',
  'Plomería',
  'Plomería',
  'Plomería',
  'Electricidad',
  'Electricidad',
  'Pintura',
  'Pintura',
];
// Nombres comunes en Santa Cruz: apellidos cruceños y del occidente del país.
// Los trabajadores siguen el orden de SPECIALTIES.
const NAMES: Record<string, string[]> = {
  client: [
    'María Fernanda Justiniano',
    'Luis Fernando Saucedo',
    'Carla Antelo',
    'Juan Carlos Áñez',
    'Daniela Roca',
    'Marcelo Vaca',
    'Gabriela Rivero',
    'José Luis Suárez',
    'Paola Cuéllar',
    'Rodrigo Landívar',
  ],
  worker: [
    'Rosa Mamani',
    'Lourdes Arteaga',
    'Gladys Choque',
    'Freddy Quispe',
    'Wilson Montero',
    'Ronald Vargas',
    'Jhonny Peña',
    'Edwin Gutiérrez',
    'Mario Flores',
    'Raúl Melgar',
  ],
};
const COLORS = ['#7c3aed', '#2563eb', '#059669', '#db2777', '#d97706'];
const TITLES: Record<string, string> = {
  Limpieza: 'Limpieza de una habitación',
  Plomería: 'Revisión de un grifo',
  Electricidad: 'Revisión de una luminaria',
  Pintura: 'Pintar una pared',
};

@Injectable()
export class BotsService {
  private readonly logger = new Logger(BotsService.name);
  private ticking = false;
  constructor(private readonly db: DataSource) {}

  // All control and processing transactions lock this single row. The lock is
  // shared across replicas and makes stop a fence, including for in-flight ticks.
  private async locked(em: EntityManager): Promise<Settings> {
    return (
      await em.query(`SELECT *, (next_start_at IS NULL OR next_start_at <= now()) AS should_start
      FROM chamba_simulation.settings WHERE id = 1 FOR UPDATE`)
    )[0];
  }

  private async latestClient(em: EntityManager): Promise<Anchor | null> {
    return (
      (
        await em.query(`SELECT id, concat_ws(' ',first_name,last_name) AS name,
      ST_Y(current_location::geometry) AS latitude, ST_X(current_location::geometry) AS longitude,
      location_updated_at AS "updatedAt" FROM users
      WHERE type = 'client' AND NOT is_blocked AND deleted_at IS NULL
        AND current_location IS NOT NULL AND location_updated_at IS NOT NULL
        AND email <> 'cliente.demo@chamba.app'
      ORDER BY location_updated_at DESC, id LIMIT 1`)
      )[0] ?? null
    );
  }

  private async center(
    em: EntityManager,
    s: Settings,
  ): Promise<{ point: Point; anchor: Anchor | null }> {
    if (!s.zone_configured)
      throw new BadRequestException(
        'Guarda primero la zona circular de funcionamiento.',
      );
    const anchor =
      s.center_mode === 'latest_client' ? await this.latestClient(em) : null;
    if (s.center_mode === 'latest_client' && !anchor) {
      throw new BadRequestException(
        'Aún no hay una actualización de ubicación de un cliente registrada. Marca una zona manual o espera una actualización desde la app.',
      );
    }
    return {
      point: anchor ?? { latitude: s.latitude, longitude: s.longitude },
      anchor,
    };
  }

  private async audit(
    em: EntityManager,
    kind: string,
    actor?: string,
    detail?: string,
    scenarioId?: string,
  ) {
    await em.query(
      `INSERT INTO chamba_simulation.actions(kind,actor_id,detail,scenario_id)
      VALUES($1,$2,$3,$4) ON CONFLICT (scenario_id,kind) DO NOTHING`,
      [kind, actor ?? null, detail ?? null, scenarioId ?? null],
    );
  }

  async snapshot() {
    return this.db.transaction('REPEATABLE READ', async (em) => {
      const settings = (
        await em.query('SELECT * FROM chamba_simulation.settings WHERE id = 1')
      )[0];
      const latestClient = await this.latestClient(em);
      const profiles =
        await em.query(`SELECT p.*, active.id AS active_scenario_id, active.state AS current_state,
        (SELECT count(*)::int FROM chamba_simulation.scenarios h WHERE h.state='completed'
          AND (h.client_id=p.id OR h.worker_id=p.id)) AS completed_count
        FROM chamba_simulation.profiles p LEFT JOIN chamba_simulation.scenarios active
          ON (active.client_id=p.id OR active.worker_id=p.id) AND active.state NOT IN ('completed','cancelled')
        ORDER BY p.role,p.id`);
      const scenarios =
        await em.query(`SELECT s.*, c.name AS client_name, w.name AS worker_name
        FROM chamba_simulation.scenarios s JOIN chamba_simulation.profiles c ON c.id=s.client_id
        JOIN chamba_simulation.profiles w ON w.id=s.worker_id ORDER BY s.created_at DESC LIMIT 100`);
      const stats = (
        await em.query(`SELECT count(*) FILTER (WHERE state NOT IN ('completed','cancelled'))::int AS active,
        count(*) FILTER (WHERE state='completed')::int AS completed,
        count(*) FILTER (WHERE state='cancelled')::int AS cancelled,
        count(*) FILTER (WHERE created_at >= (date_trunc('day', now() AT TIME ZONE 'America/La_Paz') AT TIME ZONE 'America/La_Paz'))::int AS today
        FROM chamba_simulation.scenarios`)
      )[0];
      const actions = await em.query(
        'SELECT * FROM chamba_simulation.actions ORDER BY id DESC LIMIT 100',
      );
      const zone = !settings.zone_configured
        ? null
        : settings.center_mode === 'manual'
          ? {
              latitude: settings.latitude,
              longitude: settings.longitude,
              radiusKm: settings.radius_km,
            }
          : latestClient
            ? {
                latitude: latestClient.latitude,
                longitude: latestClient.longitude,
                radiusKm: settings.radius_km,
              }
            : null;
      return {
        simulation: true,
        settings,
        latestClient,
        zone,
        profiles,
        scenarios,
        stats,
        actions,
        serverTime: new Date().toISOString(),
      };
    });
  }

  async configure(dto: BotSettingsDto, actor: string) {
    await this.db.transaction(async (em) => {
      const s = await this.locked(em);
      await this.assertEditable(em, s);
      await em.query(
        `UPDATE chamba_simulation.settings SET center_mode=$1, latitude=$2, longitude=$3,
        radius_km=$4, interval_seconds=$5, step_seconds=$6, max_concurrent=$7, daily_limit=$8,
        zone_configured=true, last_error=NULL, updated_by=$9, updated_at=now() WHERE id=1`,
        [
          dto.centerMode,
          dto.latitude,
          dto.longitude,
          dto.radiusKm,
          dto.intervalSeconds,
          dto.stepSeconds,
          dto.maxConcurrent,
          dto.dailyLimit,
          actor,
        ],
      );
      const next = await this.locked(em);
      const { point } = await this.center(em, next);
      await this.placeProfiles(em, point, dto.radiusKm);
      await this.audit(
        em,
        'settings',
        actor,
        `Zona ${dto.centerMode}, radio ${dto.radiusKm} km`,
      );
    });
    return this.snapshot();
  }

  private async assertEditable(em: EntityManager, s: Settings) {
    const [{ count }] = await em.query(
      `SELECT count(*)::int AS count FROM chamba_simulation.scenarios WHERE state NOT IN ('completed','cancelled')`,
    );
    if (s.state === 'running' || s.state === 'pausing' || count > 0) {
      throw new BadRequestException(
        'Detén los bots o espera a que termine la pausa antes de editar.',
      );
    }
  }

  private async placeProfiles(
    em: EntityManager,
    center: Point,
    radiusKm: number,
  ) {
    const rows = await em.query('SELECT id FROM chamba_simulation.profiles');
    for (const row of rows) {
      const p = randomPoint(center, radiusKm);
      await em.query(
        'UPDATE chamba_simulation.profiles SET latitude=$2,longitude=$3 WHERE id=$1',
        [row.id, p.latitude, p.longitude],
      );
    }
  }

  async provision(actor: string) {
    await this.db.transaction(async (em) => {
      const s = await this.locked(em);
      for (const role of ['client', 'worker']) {
        for (let i = 0; i < 10; i++) {
          const code = `${role === 'client' ? 'CLIENT' : 'WORKER'}-${String(i + 1).padStart(2, '0')}`;
          await em.query(
            `INSERT INTO chamba_simulation.profiles(id,role,name,avatar_color,specialty)
            VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name
            WHERE profiles.name ~ '^(Cliente|Trabajador) demo [0-9]{2}$'`,
            [
              code,
              role,
              NAMES[role][i],
              COLORS[i % COLORS.length],
              SPECIALTIES[i],
            ],
          );
        }
      }
      // Provisioning is safe to retry while running: do not move active actors.
      if (s.zone_configured && s.state !== 'running' && s.state !== 'pausing') {
        const [{ count }] = await em.query(
          `SELECT count(*)::int AS count FROM chamba_simulation.scenarios WHERE state NOT IN ('completed','cancelled')`,
        );
        if (count === 0) {
          const anchor =
            s.center_mode === 'latest_client' ? await this.latestClient(em) : s;
          if (anchor) await this.placeProfiles(em, anchor, s.radius_km);
        }
      }
      await this.audit(
        em,
        'provision',
        actor,
        '10 clientes y 10 trabajadores de simulación; identidades estables',
      );
    });
    return this.snapshot();
  }

  async profile(id: string, dto: BotProfileDto, actor: string) {
    await this.db.transaction(async (em) => {
      const s = await this.locked(em);
      await this.assertEditable(em, s);
      const [existing] = await em.query(
        'SELECT id FROM chamba_simulation.profiles WHERE id=$1',
        [id],
      );
      if (!existing) throw new NotFoundException('Bot no encontrado');
      await em.query(
        `UPDATE chamba_simulation.profiles SET name=coalesce($2,name), enabled=coalesce($3,enabled),
        specialty=coalesce($4,specialty) WHERE id=$1`,
        [
          id,
          dto.name?.trim() || null,
          dto.enabled ?? null,
          dto.specialty ?? null,
        ],
      );
      await this.audit(em, 'profile', actor, id);
    });
    return this.snapshot();
  }

  async control(command: 'start' | 'pause' | 'stop', actor: string) {
    await this.db.transaction(async (em) => {
      const s = await this.locked(em);
      if (command === 'start') {
        if (s.state === 'running') return;
        await this.center(em, s);
        const [{ count }] = await em.query(
          'SELECT count(*)::int AS count FROM chamba_simulation.profiles',
        );
        if (count !== 20)
          throw new BadRequestException(
            'Crea primero los 20 perfiles de simulación.',
          );
        await this.assertPair(em);
        await em.query(
          `UPDATE chamba_simulation.settings SET state='running',next_start_at=now(),last_error=NULL,
          updated_by=$1,updated_at=now() WHERE id=1`,
          [actor],
        );
      } else if (command === 'pause') {
        if (s.state !== 'running') return;
        const [{ count }] = await em.query(
          `SELECT count(*)::int AS count FROM chamba_simulation.scenarios WHERE state NOT IN ('completed','cancelled')`,
        );
        await em.query(
          `UPDATE chamba_simulation.settings SET state=$1,updated_by=$2,updated_at=now() WHERE id=1`,
          [count > 0 ? 'pausing' : 'paused', actor],
        );
      } else {
        await em.query(
          `UPDATE chamba_simulation.settings SET state='off',generation=generation+1,
          next_start_at=NULL,last_error=NULL,updated_by=$1,updated_at=now() WHERE id=1`,
          [actor],
        );
        const cancelled =
          await em.query(`UPDATE chamba_simulation.scenarios SET state='cancelled',finished_at=now()
          WHERE state NOT IN ('completed','cancelled') RETURNING id`);
        for (const row of cancelled[0] ?? [])
          await this.audit(
            em,
            'cancelled',
            actor,
            'Detención administrativa',
            row.id,
          );
      }
      await this.audit(em, command, actor);
    });
    return this.snapshot();
  }

  private async assertPair(em: EntityManager) {
    const [pair] = await em.query(`SELECT c.id FROM chamba_simulation.profiles c
      JOIN chamba_simulation.profiles w ON w.specialty=c.specialty AND w.role='worker' AND w.enabled
      WHERE c.role='client' AND c.enabled LIMIT 1`);
    if (!pair)
      throw new BadRequestException(
        'Habilita un cliente y un trabajador con el mismo oficio.',
      );
  }

  private async createScenario(
    em: EntityManager,
    s: Settings,
    manual: boolean,
    id: string,
    actor?: string,
  ) {
    const [{ active, today }] =
      await em.query(`SELECT count(*) FILTER (WHERE state NOT IN ('completed','cancelled'))::int AS active,
      count(*) FILTER (WHERE created_at >= (date_trunc('day',now() AT TIME ZONE 'America/La_Paz') AT TIME ZONE 'America/La_Paz'))::int AS today
      FROM chamba_simulation.scenarios`);
    if (active >= s.max_concurrent)
      throw new BadRequestException(
        'Se alcanzó el máximo de trabajos simultáneos.',
      );
    if (today >= s.daily_limit)
      throw new BadRequestException(
        'Se alcanzó el límite diario de simulación.',
      );
    const { point: center, anchor } = await this.center(em, s);
    // Reserve the compatible pair before publishing. Only simulation tables are
    // writable from this module; a real worker can never take this scenario.
    const [pair] =
      await em.query(`SELECT c.id AS client_id,w.id AS worker_id,c.specialty FROM chamba_simulation.profiles c
      JOIN chamba_simulation.profiles w ON w.specialty=c.specialty AND w.role='worker' AND w.enabled
      WHERE c.role='client' AND c.enabled
        AND NOT EXISTS (SELECT 1 FROM chamba_simulation.scenarios a WHERE a.state NOT IN ('completed','cancelled')
          AND (a.client_id=c.id OR a.worker_id=w.id)) ORDER BY random() LIMIT 1`);
    if (!pair)
      throw new BadRequestException(
        'No hay una pareja de bots libre con el mismo oficio.',
      );
    const clientPoint = randomPoint(center, s.radius_km);
    const workerPoint = randomPoint(center, s.radius_km);
    await em.query(
      'UPDATE chamba_simulation.profiles SET latitude=$2,longitude=$3 WHERE id=$1',
      [pair.client_id, clientPoint.latitude, clientPoint.longitude],
    );
    await em.query(
      'UPDATE chamba_simulation.profiles SET latitude=$2,longitude=$3 WHERE id=$1',
      [pair.worker_id, workerPoint.latitude, workerPoint.longitude],
    );
    await em.query(
      `INSERT INTO chamba_simulation.scenarios(id,client_id,worker_id,category,title,budget,state,
      latitude,longitude,center_latitude,center_longitude,radius_km,anchor_client_id,generation,manual,due_at)
      VALUES($1,$2,$3,$4,$5,$6,'published',$7,$8,$9,$10,$11,$12,$13,$14,now()+$15*interval '1 second')`,
      [
        id,
        pair.client_id,
        pair.worker_id,
        pair.specialty,
        TITLES[pair.specialty],
        80,
        clientPoint.latitude,
        clientPoint.longitude,
        center.latitude,
        center.longitude,
        s.radius_km,
        anchor?.id ?? null,
        s.generation,
        manual,
        s.step_seconds,
      ],
    );
    await this.audit(
      em,
      'published',
      actor,
      'Pedido simulado; pago en efectivo simulado, sin cobros',
      id,
    );
    await em.query(
      'UPDATE chamba_simulation.settings SET last_error=NULL WHERE id=1',
    );
  }

  async runOnce(id: string, actor: string) {
    await this.db.transaction(async (em) => {
      const s = await this.locked(em);
      if (
        (
          await em.query(
            'SELECT id FROM chamba_simulation.scenarios WHERE id=$1',
            [id],
          )
        )[0]
      )
        return;
      if (s.state === 'pausing')
        throw new BadRequestException('Espera a que termine la pausa.');
      await this.createScenario(em, s, true, id, actor);
    });
    return this.snapshot();
  }

  // Persistent due_at + a transaction per short tick survives restarts without
  // Redis timers. No client browser, mobile device, or long-running job needed.
  @Interval(5000)
  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.db.transaction(async (em) => {
        const s = await this.locked(em);
        const due = await em.query(
          `SELECT * FROM chamba_simulation.scenarios WHERE due_at<=now()
          AND generation=$1 AND state NOT IN ('completed','cancelled')
          AND (manual OR $2 IN ('running','pausing')) ORDER BY due_at FOR UPDATE`,
          [s.generation, s.state],
        );
        for (const scenario of due) {
          const next = NEXT_STATE[scenario.state];
          if (!next) throw new Error('Estado de simulación desconocido');
          await em.query(
            `UPDATE chamba_simulation.scenarios SET state=$2, due_at=now()+$3*interval '1 second',
            finished_at=CASE WHEN $2='completed' THEN now() ELSE NULL END WHERE id=$1`,
            [scenario.id, next, s.step_seconds],
          );
          if (next === 'arrived') {
            await em.query(
              'UPDATE chamba_simulation.profiles SET latitude=$2,longitude=$3 WHERE id=$1',
              [scenario.worker_id, scenario.latitude, scenario.longitude],
            );
          }
          await this.audit(em, next, undefined, undefined, scenario.id);
        }
        if (s.state === 'pausing') {
          await em.query(`UPDATE chamba_simulation.settings SET state='paused',updated_at=now() WHERE id=1
            AND NOT EXISTS (SELECT 1 FROM chamba_simulation.scenarios WHERE state NOT IN ('completed','cancelled'))`);
        }
        if (s.state === 'running' && s.should_start) {
          try {
            await this.createScenario(em, s, false, randomUUID());
          } catch (error) {
            if (!(error instanceof BadRequestException)) throw error;
            await em.query(
              'UPDATE chamba_simulation.settings SET last_error=$1 WHERE id=1',
              [error.message],
            );
          }
          await em.query(
            `UPDATE chamba_simulation.settings SET next_start_at=now()+interval_seconds*interval '1 second' WHERE id=1`,
          );
        }
      });
    } catch (error) {
      this.logger.error(
        'No se pudo procesar la simulación; se reintentará desde el último paso confirmado.',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.ticking = false;
    }
  }
}
