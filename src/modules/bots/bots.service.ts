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
  // 8 Limpieza, 8 Plomería, 7 Electricidad, 7 Pintura (total 30)
  'Limpieza',
  'Limpieza',
  'Limpieza',
  'Limpieza',
  'Limpieza',
  'Limpieza',
  'Limpieza',
  'Limpieza',
  'Plomería',
  'Plomería',
  'Plomería',
  'Plomería',
  'Plomería',
  'Plomería',
  'Plomería',
  'Plomería',
  'Electricidad',
  'Electricidad',
  'Electricidad',
  'Electricidad',
  'Electricidad',
  'Electricidad',
  'Electricidad',
  'Pintura',
  'Pintura',
  'Pintura',
  'Pintura',
  'Pintura',
  'Pintura',
  'Pintura',
];

// Nombres auténticos de Santa Cruz de la Sierra: apellidos tradicionales cruceños y bolivianos.
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
    'Valeria Aguilera',
    'Carlos Eduardo Melgar',
    'Silvana Parada',
    'Mario Dorado',
    'Claudia Chávez',
    'Jorge Hurtado',
    'Natalia Ribera',
    'Fabio Terrazas',
    'Mariana Pinto',
    'Alejandro Montero',
    'Nicole Mercado',
    'Mateo Banegas',
    'Luciana Barba',
    'Mauricio Céspedes',
    'Andrea Soliz',
    'Julio César Paz',
    'Camila Ortiz',
    'Diego Villarroel',
    'Sofía Rojas',
    'Bruno Ribera',
  ],
  worker: [
    'Rosa Mamani',
    'Lourdes Arteaga',
    'Gladys Choque',
    'Carmen Saucedo',
    'Miriam Justiniano',
    'Patricia Colque',
    'Silvia Vaca',
    'Elena Banegas',
    'Freddy Quispe',
    'Wilson Montero',
    'Ronald Vargas',
    'Javier Condori',
    'Walter Banegas',
    'Gustavo Roca',
    'Hugo Terrazas',
    'Jhonny Peña',
    'Edwin Gutiérrez',
    'Mario Flores',
    'Oscar Aguilera',
    'Ricardo Hurtado',
    'Hernán Chávez',
    'Leonardo Pinto',
    'Raúl Melgar',
    'Félix Dorado',
    'Víctor Céspedes',
    'Germán Mercado',
    'Boris Landívar',
    'Jaime Soliz',
    'Roberto Cuéllar',
    'Antonio Parada',
  ],
};

const AVATAR_URLS: Record<string, string[]> = {
  client: [
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362818/chamba/bots/wxvul2bcmu3qmk9p9cuj.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362819/chamba/bots/dggt6oa8guj4ilm7buc0.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362819/chamba/bots/tfvntkegzb0zvq83exfw.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362820/chamba/bots/gnyghxni3ao84w8imhzo.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362821/chamba/bots/pa9pv2tp67qdafwluumh.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362821/chamba/bots/jbxg1tec5eygjrru1sex.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362822/chamba/bots/ekl6njsrb7usofz6xr2f.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362823/chamba/bots/occndfimc51t7ynjndsb.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362824/chamba/bots/gqlwstq1kjvoifgqbaer.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362825/chamba/bots/hoyrhuyi0h8rra5oykef.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362825/chamba/bots/xdopsb8ejugknwetohkf.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362826/chamba/bots/kud1xx3pgiqcy6n9iuic.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362827/chamba/bots/mxyyz8hrqljljvtbxqio.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362828/chamba/bots/qbthrykz2y3fseh6p4t4.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362828/chamba/bots/tw0etq70kwsonlqyehrr.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362829/chamba/bots/l2utkdinjiawa7kpzxpj.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362830/chamba/bots/m0cw6llj1mzpiizy0esa.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362830/chamba/bots/zmzmvwiqohlfvws4dsth.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362832/chamba/bots/zdcqacynbiqwuwmsafq8.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362832/chamba/bots/ljbbrsor6lqfzad1qqgp.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362833/chamba/bots/jmgyhhrai5s2p8c2cjc8.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362834/chamba/bots/stm5zhb6wgbfyfe2ngyw.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362835/chamba/bots/elo5sosyyfchnehnlb73.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362835/chamba/bots/mqlfwnftndvhtjpepbla.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362836/chamba/bots/pbzzhi2tmnt7cruxin4k.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362837/chamba/bots/jef7tzyomqxkqcxkhna2.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362838/chamba/bots/pm8muj7tfydqhgqq5ja7.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362839/chamba/bots/l0pxzbi27ha45hsym49n.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362839/chamba/bots/km1dsji4gwfbwagettbg.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362840/chamba/bots/zcl2aowxgvhzqneaxfdt.jpg',
  ],
  worker: [
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362841/chamba/bots/gcv9imxrfryvtitb39iq.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362841/chamba/bots/wj5xctmf0zdbuyyafhkq.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362842/chamba/bots/dmjvw9wlchnkmhzoqnuu.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362843/chamba/bots/gdxuymcgenod2r8wlgpi.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362844/chamba/bots/yta6poay1up7iouwfjsa.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362844/chamba/bots/wkilkyjctzsu45lula24.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362845/chamba/bots/fcevuukwbqfmane3irzu.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362845/chamba/bots/jrh7a0frejwhg1jwj9bt.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362846/chamba/bots/wt9hy7lueufsz2ewmkvu.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362847/chamba/bots/ryccvnwxsbzbxfjmkxi2.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362847/chamba/bots/vua23zd61u4xsuralcre.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362848/chamba/bots/htgapovk8mbzmmvte0qk.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362848/chamba/bots/xm6ckyohwhwom4f5e2us.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362850/chamba/bots/vrptivhlhpccn7bwymhf.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362851/chamba/bots/lsty6upwuebkfrekp1uw.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362852/chamba/bots/bhddkotw2cnipn3zhxi8.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362852/chamba/bots/i2kqz8oztesyjavvzzb4.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362853/chamba/bots/m5osujchxxdbg7pnfdhv.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362854/chamba/bots/drz2n46wrwis7lvmya4s.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362854/chamba/bots/licjnl8qgis3aoypcxsr.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362855/chamba/bots/fgljajafbumkfehvjq95.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362855/chamba/bots/vau1kal60rawaszojwwt.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362856/chamba/bots/nlytuuqj51zdnqbnrrf6.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362857/chamba/bots/ep3faukylbtub86tlobd.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362858/chamba/bots/tztso6h6nj8djzilbvi3.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362859/chamba/bots/dool5shqeeu2j1gt7s6w.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362859/chamba/bots/vnskzud5tjdn0wmu7b0t.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362860/chamba/bots/xhmhkdy2hutqk8h7jjmf.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362861/chamba/bots/aiupwrrtd2uojks3mgrl.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362862/chamba/bots/nmezgpi8gp6wlryuicjc.jpg',
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
      await em.query(
        'ALTER TABLE chamba_simulation.profiles ADD COLUMN IF NOT EXISTS avatar_url text;',
      );
      const s = await this.locked(em);
      for (const role of ['client', 'worker']) {
        for (let i = 0; i < 30; i++) {
          const code = `${role === 'client' ? 'CLIENT' : 'WORKER'}-${String(i + 1).padStart(2, '0')}`;
          const avatarUrl = AVATAR_URLS[role][i];
          await em.query(
            `INSERT INTO chamba_simulation.profiles(id,role,name,avatar_color,specialty,avatar_url)
            VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,
            specialty=EXCLUDED.specialty, avatar_url=EXCLUDED.avatar_url`,
            [
              code,
              role,
              NAMES[role][i],
              COLORS[i % COLORS.length],
              SPECIALTIES[i],
              avatarUrl,
            ],
          );
        }
      }

      // Sincronizar también los 30 clientes y 30 trabajadores en la tabla 'users'
      // para que aparezcan en Clientes y Trabajadores del Admin con fotos e información cruceña.
      for (let i = 0; i < 30; i++) {
        const clientFullName = NAMES.client[i];
        const clientParts = clientFullName.split(' ');
        const clientFirst = clientParts[0];
        const clientLast = clientParts.slice(1).join(' ');
        const clientEmail = `cliente.bot${String(i + 1).padStart(2, '0')}@chamba.bo`;
        const clientPhone = `7${String(1000000 + i * 2931).slice(0, 7)}`;
        const clientPhoto = AVATAR_URLS.client[i];
        const clientLat = -17.7833 + Math.sin((i + 1) * 1.3) * 0.035;
        const clientLng = -63.1821 + Math.cos((i + 1) * 1.3) * 0.035;

        await em.query(
          `INSERT INTO users (type, email, phone, country_code, first_name, last_name, profile_photo_url,
            current_location, location_updated_at, verification_status, average_rating, completed_jobs, is_available)
          VALUES ('client', $1, $2, '+591', $3, $4, $5,
            ST_SetSRID(ST_MakePoint($7, $6), 4326), now(), 'verified', 5.0, 0, true)
          ON CONFLICT (email) DO UPDATE SET
            profile_photo_url = EXCLUDED.profile_photo_url,
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            current_location = EXCLUDED.current_location,
            location_updated_at = now()`,
          [
            clientEmail,
            clientPhone,
            clientFirst,
            clientLast,
            clientPhoto,
            clientLat,
            clientLng,
          ],
        );

        const workerFullName = NAMES.worker[i];
        const workerParts = workerFullName.split(' ');
        const workerFirst = workerParts[0];
        const workerLast = workerParts.slice(1).join(' ');
        const workerEmail = `trabajador.bot${String(i + 1).padStart(2, '0')}@chamba.bo`;
        const workerPhone = `7${String(2000000 + i * 3147).slice(0, 7)}`;
        const workerPhoto = AVATAR_URLS.worker[i];
        const workerLat = -17.7833 + Math.cos((i + 1) * 1.1) * 0.04;
        const workerLng = -63.1821 + Math.sin((i + 1) * 1.1) * 0.04;
        const rating = +(4.6 + ((i * 7) % 5) * 0.1).toFixed(1);
        const completedJobs = 8 + ((i * 3) % 40);

        await em.query(
          `INSERT INTO users (type, email, phone, country_code, first_name, last_name, profile_photo_url,
            current_location, location_updated_at, verification_status, average_rating, completed_jobs, is_available, work_modalities)
          VALUES ('worker', $1, $2, '+591', $3, $4, $5,
            ST_SetSRID(ST_MakePoint($7, $6), 4326), now(), 'verified', $8, $9, true, $10)
          ON CONFLICT (email) DO UPDATE SET
            profile_photo_url = EXCLUDED.profile_photo_url,
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            current_location = EXCLUDED.current_location,
            location_updated_at = now(),
            work_modalities = EXCLUDED.work_modalities`,
          [
            workerEmail,
            workerPhone,
            workerFirst,
            workerLast,
            workerPhoto,
            workerLat,
            workerLng,
            rating,
            completedJobs,
            JSON.stringify([SPECIALTIES[i]]),
          ],
        );
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
        '30 clientes y 30 trabajadores de simulación con fotos de perfil e identidades cruceñas',
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
        if (count < 2)
          throw new BadRequestException(
            'Crea primero los perfiles de simulación.',
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
