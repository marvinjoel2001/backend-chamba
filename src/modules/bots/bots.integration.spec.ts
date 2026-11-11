import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { BotSimulation1793652000000 } from '../../infrastructure/database/migrations/1793652000000-BotSimulation';
import { BotsService } from './bots.service';
import { BotSettingsDto } from './bots.dto';
import { destination, randomPoint } from './bots.geometry';

const url = process.env.BOTS_TEST_DATABASE_URL;
const integration = url ? describe : describe.skip;

describe('simulation geometry', () => {
  it('keeps all points inside the circle, including at the date line', () => {
    for (const center of [
      { latitude: -17.8, longitude: -63.2 },
      { latitude: 80, longitude: 179.99 },
    ]) {
      for (let i = 0; i < 500; i++) {
        const p = randomPoint(center, 50);
        const rad = Math.PI / 180;
        const a =
          Math.sin(((p.latitude - center.latitude) * rad) / 2) ** 2 +
          Math.cos(center.latitude * rad) *
            Math.cos(p.latitude * rad) *
            Math.sin(((p.longitude - center.longitude) * rad) / 2) ** 2;
        expect(6371 * 2 * Math.asin(Math.sqrt(a))).toBeLessThanOrEqual(
          50.000001,
        );
        expect(p.longitude).toBeGreaterThanOrEqual(-180);
        expect(p.longitude).toBeLessThanOrEqual(180);
      }
    }
    expect(destination({ latitude: 0, longitude: 0 }, 0, 0)).toEqual({
      latitude: 0,
      longitude: 0,
    });
  });
});

integration('BotsService with isolated PostgreSQL/PostGIS', () => {
  let db: DataSource;
  let bots: BotsService;
  const actor = randomUUID();
  const config: BotSettingsDto = {
    centerMode: 'manual',
    latitude: -17.7833,
    longitude: -63.1821,
    radiusKm: 2,
    intervalSeconds: 60,
    stepSeconds: 5,
    maxConcurrent: 3,
    dailyLimit: 30,
  };
  const due = async () =>
    db.query(
      `UPDATE chamba_simulation.scenarios SET due_at=now()-interval '1 second'`,
    );
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (
      !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
      !parsed.pathname.endsWith('_verification')
    ) {
      throw new Error(
        'Integration tests require a local, disposable *_verification database',
      );
    }
    db = new DataSource({ type: 'postgres', url });
    await db.initialize();
    await db.query(`CREATE EXTENSION IF NOT EXISTS postgis;
      CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),type text NOT NULL,
        first_name text,last_name text,email text,is_blocked boolean DEFAULT false,deleted_at timestamptz,
        current_location geography(Point,4326), updated_at timestamptz DEFAULT now());
      INSERT INTO users(type,first_name,email,current_location) VALUES ('client','Real','real@example.test',ST_SetSRID(ST_MakePoint(-63.2,-17.8),4326)),
        ('worker','Real worker','worker@example.test',NULL);`);
    await new BotSimulation1793652000000().up(db.createQueryRunner());
    bots = new BotsService(db);
  });
  afterAll(async () => {
    if (db?.isInitialized) {
      await new BotSimulation1793652000000().down(db.createQueryRunner());
      await db.query('DROP TABLE users');
      await db.destroy();
    }
  });
  beforeEach(async () => {
    await db.query(`TRUNCATE chamba_simulation.actions,chamba_simulation.scenarios,chamba_simulation.profiles;
      UPDATE chamba_simulation.settings SET state='off',zone_configured=false,generation=1,last_error=NULL,next_start_at=NULL;
      UPDATE users SET location_updated_at=NULL;`);
    await bots.configure(config, actor);
    await bots.provision(actor);
  });

  it('provisions 60 simulation profiles (30 clients and 30 workers)', async () => {
    await Promise.all([bots.provision(actor), bots.provision(actor)]);
    const s = await bots.snapshot();
    expect(s.profiles).toHaveLength(60);
    expect(s.profiles.filter((p) => p.role === 'worker')).toHaveLength(30);
    expect(s.settings.state).toBe('off');
  });

  it('completes a reserved bot pair once across multiple replicas, retaining state after restart', async () => {
    const id = randomUUID();
    await Promise.all([bots.runOnce(id, actor), bots.runOnce(id, actor)]);
    const restarted = new BotsService(db);
    for (let i = 0; i < 6; i++) {
      await due();
      await Promise.all([bots.tick(), restarted.tick()]);
    }
    const s = await restarted.snapshot();
    expect(s.scenarios).toHaveLength(1);
    expect(s.scenarios[0].state).toBe('completed');
    expect(s.scenarios[0].client_id).toMatch(/^CLIENT-/);
    expect(s.scenarios[0].worker_id).toMatch(/^WORKER-/);
    expect(s.actions.filter((a) => a.scenario_id === id)).toHaveLength(7);
    expect(s.stats.completed).toBe(1);
    expect(s.stats.active).toBe(0);
    expect((await db.query('SELECT count(*)::int AS n FROM users'))[0].n).toBe(
      2,
    );
  });

  it('enforces capacity atomically, stops active work, and permits no actions after stop acknowledges', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => bots.runOnce(randomUUID(), actor)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    await due();
    await Promise.all([bots.tick(), bots.control('stop', actor)]);
    const stopped = await bots.snapshot();
    expect(stopped.stats.active).toBe(0);
    expect(stopped.stats.cancelled).toBe(3);
    await due();
    await Promise.all([bots.tick(), new BotsService(db).tick()]);
    expect((await bots.snapshot()).actions).toHaveLength(
      stopped.actions.length,
    );
    expect(stopped.actions.filter((a) => a.kind === 'cancelled')).toHaveLength(
      3,
    );
  });

  it('pause drains work and prevents new jobs; refuses moving a zone while active', async () => {
    await bots.control('start', actor);
    await bots.tick();
    await expect(
      bots.configure({ ...config, radiusKm: 4 }, actor),
    ).rejects.toThrow('Detén');
    expect((await bots.control('pause', actor)).settings.state).toBe('pausing');
    for (let i = 0; i < 6; i++) {
      await due();
      await bots.tick();
    }
    const paused = await bots.snapshot();
    expect(paused.settings.state).toBe('paused');
    expect(paused.stats.completed).toBe(1);
    expect(paused.scenarios).toHaveLength(1);
    await bots.configure({ ...config, radiusKm: 4 }, actor);
  });

  it('anchors to actual latest client location updates, never profile edits, and freezes each job zone', async () => {
    await expect(
      bots.configure({ ...config, centerMode: 'latest_client' }, actor),
    ).rejects.toThrow('Aún no hay');
    await db.query(
      `UPDATE users SET current_location=ST_SetSRID(ST_MakePoint(-68.15,-16.5),4326) WHERE type='client'`,
    );
    await bots.configure({ ...config, centerMode: 'latest_client' }, actor);
    await bots.runOnce(randomUUID(), actor);
    await db.query(
      `UPDATE users SET current_location=ST_SetSRID(ST_MakePoint(-63.2,-17.8),4326) WHERE type='client'`,
    );
    const before = (await bots.snapshot()).latestClient!.updatedAt;
    await db.query(
      `UPDATE users SET first_name='Changed',updated_at=now() WHERE type='client'`,
    );
    const s = await bots.snapshot();
    expect(s.latestClient!.updatedAt).toEqual(before);
    expect(s.zone!.latitude).toBe(-17.8);
    expect(s.scenarios[0].center_latitude).toBe(-16.5);
    await expect(
      bots.profile('WORKER-01', { enabled: false }, actor),
    ).rejects.toThrow('Detén');
  });

  it('enforces the daily cap and requires compatible enabled bots', async () => {
    await bots.configure({ ...config, dailyLimit: 1 }, actor);
    await bots.runOnce(randomUUID(), actor);
    await expect(bots.runOnce(randomUUID(), actor)).rejects.toThrow(
      'límite diario',
    );
    await bots.control('stop', actor);
    await db.query(
      `UPDATE chamba_simulation.profiles SET enabled=false WHERE role='worker'`,
    );
    await expect(bots.control('start', actor)).rejects.toThrow('Habilita');
  });
});
