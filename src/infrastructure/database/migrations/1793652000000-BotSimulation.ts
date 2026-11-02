import { MigrationInterface, QueryRunner } from 'typeorm';

export class BotSimulation1793652000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    // A separate namespace prevents simulation actors from entering real matching,
    // notifications, authentication, payments, or reputation queries.
    await q.query(`CREATE SCHEMA chamba_simulation;
      CREATE TABLE chamba_simulation.settings (
        id integer PRIMARY KEY CHECK (id = 1),
        state text NOT NULL DEFAULT 'off' CHECK (state IN ('off','running','pausing','paused')),
        generation integer NOT NULL DEFAULT 1,
        zone_configured boolean NOT NULL DEFAULT false,
        center_mode text NOT NULL DEFAULT 'manual' CHECK (center_mode IN ('manual','latest_client')),
        latitude double precision NOT NULL DEFAULT -17.7833 CHECK (latitude BETWEEN -85 AND 85),
        longitude double precision NOT NULL DEFAULT -63.1821 CHECK (longitude BETWEEN -180 AND 180),
        radius_km double precision NOT NULL DEFAULT 2 CHECK (radius_km BETWEEN 0.25 AND 50),
        interval_seconds integer NOT NULL DEFAULT 600 CHECK (interval_seconds BETWEEN 60 AND 86400),
        step_seconds integer NOT NULL DEFAULT 20 CHECK (step_seconds BETWEEN 5 AND 600),
        max_concurrent integer NOT NULL DEFAULT 3 CHECK (max_concurrent BETWEEN 1 AND 10),
        daily_limit integer NOT NULL DEFAULT 30 CHECK (daily_limit BETWEEN 1 AND 500),
        next_start_at timestamptz, last_error text, updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO chamba_simulation.settings (id) VALUES (1);
      CREATE TABLE chamba_simulation.profiles (
        id text PRIMARY KEY,
        role text NOT NULL CHECK (role IN ('client','worker')),
        name text NOT NULL, avatar_color text NOT NULL,
        specialty text NOT NULL CHECK (specialty IN ('Limpieza','Plomería','Electricidad','Pintura')),
        enabled boolean NOT NULL DEFAULT true,
        latitude double precision, longitude double precision,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE chamba_simulation.scenarios (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id text NOT NULL REFERENCES chamba_simulation.profiles(id),
        worker_id text NOT NULL REFERENCES chamba_simulation.profiles(id),
        category text NOT NULL, title text NOT NULL, budget integer NOT NULL CHECK (budget > 0),
        state text NOT NULL CHECK (state IN ('published','offered','accepted','en_route','arrived','confirmed','completed','cancelled')),
        latitude double precision NOT NULL, longitude double precision NOT NULL,
        center_latitude double precision NOT NULL, center_longitude double precision NOT NULL,
        radius_km double precision NOT NULL, anchor_client_id uuid,
        generation integer NOT NULL, manual boolean NOT NULL DEFAULT false,
        due_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
      );
      CREATE UNIQUE INDEX one_active_client ON chamba_simulation.scenarios(client_id)
        WHERE state NOT IN ('completed','cancelled');
      CREATE UNIQUE INDEX one_active_worker ON chamba_simulation.scenarios(worker_id)
        WHERE state NOT IN ('completed','cancelled');
      CREATE INDEX simulation_due ON chamba_simulation.scenarios(due_at) WHERE state NOT IN ('completed','cancelled');
      CREATE INDEX simulation_created ON chamba_simulation.scenarios(created_at DESC);
      CREATE TABLE chamba_simulation.actions (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        scenario_id uuid REFERENCES chamba_simulation.scenarios(id),
        kind text NOT NULL, actor_id uuid, detail text, created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(scenario_id,kind)
      );
      CREATE INDEX simulation_actions_created ON chamba_simulation.actions(created_at DESC);
      ALTER TABLE users ADD COLUMN location_updated_at timestamptz;
      CREATE INDEX users_latest_client_location ON users(location_updated_at DESC)
        WHERE type = 'client' AND current_location IS NOT NULL AND location_updated_at IS NOT NULL;
      CREATE FUNCTION stamp_user_location() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        NEW.location_updated_at := CASE WHEN NEW.current_location IS NOT NULL THEN clock_timestamp() ELSE NULL END;
        RETURN NEW;
      END $$;
      CREATE TRIGGER stamp_user_location BEFORE INSERT OR UPDATE OF current_location ON users
        FOR EACH ROW EXECUTE FUNCTION stamp_user_location();`);
    // Existing locations have no reliable location-specific timestamp. Do not
    // backfill from updated_at (profile edits are not location updates).
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TRIGGER stamp_user_location ON users;
      DROP FUNCTION stamp_user_location();
      DROP INDEX users_latest_client_location;
      ALTER TABLE users DROP COLUMN location_updated_at;
      DROP SCHEMA chamba_simulation CASCADE;`);
  }
}
