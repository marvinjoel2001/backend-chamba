import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

/**
 * DataSource para el CLI de TypeORM (migration:run / generate / revert).
 * NO se usa en tiempo de ejecución de la app (eso lo maneja DatabaseModule);
 * solo da contexto al CLI de migraciones.
 *
 * Carga el env igual que la app: .env.local/.env en dev, .env.production/.env en prod.
 * dotenv no pisa variables ya definidas, así que el primero del arreglo tiene prioridad
 * y un env inyectado por la shell (CI/tests) gana sobre los archivos.
 */
const envFiles =
  process.env.NODE_ENV === 'production'
    ? ['.env.production', '.env']
    : ['.env.local', '.env'];
for (const file of envFiles) {
  loadEnv({ path: file });
}

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT ?? 5432),
  username: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl:
    process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/infrastructure/database/migrations/*.ts'],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
});

export default AppDataSource;
