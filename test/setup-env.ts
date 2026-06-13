// Configura las variables de entorno ANTES de importar AppModule.
// ConfigModule.forRoot() valida el esquema de env de forma síncrona al evaluarse
// el decorador @Module (es decir, al hacer `import AppModule`), que ocurre antes
// de cualquier beforeAll. Por eso el env debe quedar listo aquí, en un setupFile
// de Jest (se ejecuta antes de cargar el archivo de test y sus imports).
//
// Permite override desde el entorno real (CI/local) y cae a valores de prueba.
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_HOST: 'localhost',
  DATABASE_PORT: '5432',
  DATABASE_USERNAME: 'postgres',
  DATABASE_PASSWORD: 'sistemas123',
  DATABASE_NAME: 'chamba_test',
  DATABASE_SYNC: 'false',
  DATABASE_SSL: 'false',
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',
  REDIS_PASSWORD: '',
  REDIS_DB: '1',
  REDIS_TLS: 'false',
  SESSION_SECRET: 'test-secret-e2e-chamba-1234',
  SESSION_TTL_SECONDS: '86400',
  R2_ACCOUNT_ID: 'test',
  R2_ACCESS_KEY_ID: 'test',
  R2_SECRET_ACCESS_KEY: 'test',
  R2_BUCKET: 'test',
  R2_REGION: 'auto',
  R2_PUBLIC_URL: 'https://test.r2.dev',
  GEMINI_API_KEY: '',
  GEMINI_MODEL: 'gemini-2.0-flash',
  FIREBASE_PROJECT_ID: '',
  FIREBASE_CLIENT_EMAIL: '',
  FIREBASE_PRIVATE_KEY: '',
  API_LOGS_RETENTION_DAYS: '30',
  USE_QUEUE_DISPATCH: 'false',
};

for (const [key, value] of Object.entries(defaults)) {
  if (process.env[key] === undefined || process.env[key] === '') {
    process.env[key] = value;
  }
}
