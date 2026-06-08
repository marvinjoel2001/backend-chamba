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
  .then(() => client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`))
  .then((res) => console.log(res.rows.map(r => r.column_name).join(', ')))
  .catch(e => console.error(e))
  .finally(() => client.end());
