import { MigrationInterface, QueryRunner } from 'typeorm';

export class VerifiedPhones1793656000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE users ADD COLUMN phone_e164 varchar(16),
      ADD COLUMN phone_verified_at timestamptz, ADD COLUMN firebase_phone_uid varchar(128);
      CREATE UNIQUE INDEX users_verified_phone_unique ON users(phone_e164) WHERE phone_e164 IS NOT NULL;
      CREATE UNIQUE INDEX users_firebase_phone_unique ON users(firebase_phone_uid) WHERE firebase_phone_uid IS NOT NULL;
      CREATE FUNCTION invalidate_changed_phone() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE digits text;
      BEGIN
        digits := regexp_replace(COALESCE(NEW.phone,''),'[^0-9]+','','g');
        IF NEW.phone IS DISTINCT FROM OLD.phone AND OLD.phone_e164 IS NOT NULL
          AND digits <> replace(OLD.phone_e164,'+','')
          AND NOT (OLD.phone_e164 LIKE '+591%' AND length(OLD.phone_e164)=12 AND digits=right(OLD.phone_e164,8)) THEN
          NEW.phone_e164 := NULL; NEW.phone_verified_at := NULL; NEW.firebase_phone_uid := NULL;
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER invalidate_changed_phone BEFORE UPDATE OF phone ON users
        FOR EACH ROW EXECUTE FUNCTION invalidate_changed_phone();`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TRIGGER invalidate_changed_phone ON users; DROP FUNCTION invalidate_changed_phone();
      DROP INDEX users_verified_phone_unique; DROP INDEX users_firebase_phone_unique;
      ALTER TABLE users DROP COLUMN phone_e164, DROP COLUMN phone_verified_at, DROP COLUMN firebase_phone_uid;`);
  }
}
