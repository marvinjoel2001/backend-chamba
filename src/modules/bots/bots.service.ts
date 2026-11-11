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
  // 9 Limpieza (mujeres), 1 Pintura (mujer), 7 Plomería (varones), 7 Electricidad (varones), 5 Pintura (varones), 1 Plomería (varón) (total 30)
  'Limpieza',
  'Limpieza',
  'Limpieza',
  'Limpieza',
  'Limpieza',
  'Limpieza',
  'Limpieza',
  'Limpieza',
  'Limpieza',
  'Pintura',
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
  'Plomería',
];

// Nombres auténticos de Santa Cruz de la Sierra: apellidos tradicionales cruceños y bolivianos.
// Agrupados estrictamente por género para coincidir 1:1 con las fotos de perfil reales.
const NAMES: Record<string, string[]> = {
  client: [
    // 15 mujeres (índices 0..14)
    'María Fernanda Justiniano',
    'Carla Antelo',
    'Daniela Roca',
    'Gabriela Rivero',
    'Paola Cuéllar',
    'Valeria Aguilera',
    'Silvana Parada',
    'Claudia Chávez',
    'Natalia Ribera',
    'Mariana Pinto',
    'Nicole Mercado',
    'Luciana Barba',
    'Andrea Soliz',
    'Camila Ortiz',
    'Sofía Rojas',
    // 15 varones (índices 15..29)
    'Luis Fernando Saucedo',
    'Juan Carlos Áñez',
    'Marcelo Vaca',
    'José Luis Suárez',
    'Rodrigo Landívar',
    'Carlos Eduardo Melgar',
    'Mario Dorado',
    'Jorge Hurtado',
    'Fabio Terrazas',
    'Alejandro Montero',
    'Mateo Banegas',
    'Mauricio Céspedes',
    'Julio César Paz',
    'Diego Villarroel',
    'Bruno Ribera',
  ],
  worker: [
    // 10 mujeres (índices 0..9)
    'Rosa Mamani',
    'Lourdes Arteaga',
    'Gladys Choque',
    'Carmen Saucedo',
    'Miriam Justiniano',
    'Patricia Colque',
    'Silvia Vaca',
    'Elena Banegas',
    'Roxana Flores',
    'Martha Gutiérrez',
    // 20 varones (índices 10..29)
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
  ],
};

const AVATAR_URLS: Record<string, string[]> = {
  client: [
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366699/chamba/bots_v2/sxmlorxj7and7mpatosr.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366700/chamba/bots_v2/dkwcoebxekwhvwoinenf.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366701/chamba/bots_v2/ucfsihoz9cumc92qb9af.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366701/chamba/bots_v2/mcrxbbxxqgqgyv0fupzs.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366702/chamba/bots_v2/uj5mcn0tctid6cdk4bq6.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366702/chamba/bots_v2/uocl7xwjw8pqwvruow9b.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366703/chamba/bots_v2/kvflrxe5xtaw02ebxaju.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366704/chamba/bots_v2/hhb3yng9muh1ho0m9770.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366704/chamba/bots_v2/v0ixlqkw8fds0wicq54e.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366705/chamba/bots_v2/mzh1sohixticu2vqsx0g.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366706/chamba/bots_v2/y6ia5dxr9daiqemodqe7.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366707/chamba/bots_v2/pkae1cmskfknl68kmxco.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366707/chamba/bots_v2/wsp0bj5vucaar46cac87.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366708/chamba/bots_v2/sne20deqnvjuaqzjteyq.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366709/chamba/bots_v2/wh5nuitsky9kxbktcfk8.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366709/chamba/bots_v2/wnc0zykul5qb7f16dwyj.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366710/chamba/bots_v2/ralknwcg3okrhjpsr12r.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366710/chamba/bots_v2/hzbsds1dhbium2t7aowi.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366711/chamba/bots_v2/jkioqzydvnrwp2xqhd46.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366712/chamba/bots_v2/ggxqde6hgxz0qsdb0gvp.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366712/chamba/bots_v2/tgzqljstpdxcxcmmsdcc.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366713/chamba/bots_v2/cqzm6tswz5jkrxfzlfgx.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366713/chamba/bots_v2/hhxpg7qkdo5slepsazzz.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366714/chamba/bots_v2/xrgcndlbldmt1anwnayr.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366715/chamba/bots_v2/ffun6yn6y9k93oxghahr.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366715/chamba/bots_v2/lnpg0wryo4oni4ftdmlx.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366716/chamba/bots_v2/zw5oinbekljkurqnqupu.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366716/chamba/bots_v2/sk0hwenhsyp76jkbmken.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366717/chamba/bots_v2/ytmrhwrq7yt6u7f263rv.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366718/chamba/bots_v2/ion6avpqdyhux6jduwil.jpg',
  ],
  worker: [
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366719/chamba/bots_v2/vuftrnlvmdqrjokgcw4h.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366719/chamba/bots_v2/ximty8xfzdjnbpdbzjkh.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366720/chamba/bots_v2/f8klaxwe6kuvhfyqbfnp.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366720/chamba/bots_v2/fmivm6yfl8okwec4hjye.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366722/chamba/bots_v2/y5vlerotuwnpkbrovkko.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366723/chamba/bots_v2/yvw5lnhsb8hkbfw8xdvg.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366723/chamba/bots_v2/sxbxd3ld6jwokq1mgjga.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366724/chamba/bots_v2/difz2tzitbofrv4zyt86.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366725/chamba/bots_v2/o1rjpzv6pn7dc3j31lxh.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366725/chamba/bots_v2/e6kslurynpjpb33tc8mo.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366727/chamba/bots_v2/zuor9z6622n8gplwfa3x.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366727/chamba/bots_v2/khisuyi7rthynueqak5e.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366728/chamba/bots_v2/cznfk5bcztwsvjq2mkfr.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366729/chamba/bots_v2/fhbkqosuoh8jag7ti9bk.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366730/chamba/bots_v2/cdhh4wx15hx3nmcszemp.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366730/chamba/bots_v2/hxqetujmzghuexun82fy.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366731/chamba/bots_v2/czjsnbxgcfpwtopsn60v.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366732/chamba/bots_v2/x2ylbhoenlmxmbki4e2x.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366733/chamba/bots_v2/qslgaef3o0wmoqaf7mmb.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366733/chamba/bots_v2/hyapyjcfxeow3mvbvbnf.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366734/chamba/bots_v2/jyr099noulmzekcdzrsz.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366734/chamba/bots_v2/wfkmpulsfgeyhiswgibg.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366735/chamba/bots_v2/hs6ucfubk911hxzfkqwt.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366736/chamba/bots_v2/oghp4ns3t4i4mybiieb5.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366737/chamba/bots_v2/zpbwhvegnsfm7orawzcx.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366737/chamba/bots_v2/cogvyxan7teicwcz9pdk.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366738/chamba/bots_v2/mc5qq4expkbeoaadisl0.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366738/chamba/bots_v2/hzy9hwlon6yasbybigia.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366739/chamba/bots_v2/vbvp9jyiow6wkmaiuacm.jpg',
    'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366740/chamba/bots_v2/f67x0nlks079oga6insi.jpg',
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
