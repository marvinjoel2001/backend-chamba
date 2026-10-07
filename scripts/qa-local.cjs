// Dedicated local process: never uses DATABASE_* or REDIS_* from the production configuration.
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env.qa.private'), quiet: true });
const qaHost = process.env.QA_LINUX_HOST || '127.0.0.1';
if (!/^(127\.0\.0\.1|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(qaHost)) throw new Error('QA requires a private local host');
Object.assign(process.env, {
  NODE_ENV: 'development', PORT: '3009', DATABASE_URL: '',
  DATABASE_HOST: qaHost, DATABASE_PORT: '55432', DATABASE_USERNAME: 'chamba_qa',
  DATABASE_PASSWORD: 'qa-local-only', DATABASE_NAME: 'chamba_qa_20261007', DATABASE_SSL: 'false', DATABASE_SYNC: 'false',
  REDIS_URL: '', REDIS_HOST: qaHost, REDIS_PORT: '56379', REDIS_PASSWORD: 'qa-local-only', REDIS_TLS: 'false',
  JWT_SECRET: 'chamba-local-qa-secret-20261007', SESSION_SECRET: 'chamba-local-qa-session-20261007', USE_QUEUE_DISPATCH: 'false',
});
async function main() {
  if (process.argv.includes('--migrate')) {
    const db = require('../dist/data-source.js').default;
    await db.initialize();
    await db.runMigrations();
    console.log('QA migrations completed');
    await db.destroy();
  } else {
    require('../dist/main.js');
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
