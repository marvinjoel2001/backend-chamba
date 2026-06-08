const { Client } = require('pg');
const client = new Client({
  host: 'ep-quiet-resonance-aqzk1yld.c-8.us-east-1.aws.neon.tech',
  port: 5432,
  user: 'neondb_owner',
  password: 'npg_AVxicLMD6Pp1',
  database: 'neondb',
  ssl: { rejectUnauthorized: false }
});

client.connect()
  .then(() => client.query(`ALTER TABLE job_requests ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'Efectivo'`))
  .then(() => console.log('Schema updated'))
  .catch(e => console.error(e))
  .finally(() => client.end());
