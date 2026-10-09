import { QueryRunner } from 'typeorm';
import { EnsureCompleteSchema1791600000000 } from './1791600000000-EnsureCompleteSchema';

async function collectStatements(): Promise<string[]> {
  const statements: string[] = [];
  const runner = {
    query: jest.fn(async (sql: string) => {
      statements.push(sql);
    }),
  } as unknown as QueryRunner;
  await new EnsureCompleteSchema1791600000000().up(runner);
  return statements;
}

describe('EnsureCompleteSchema1791600000000', () => {
  it('crea todo lo que el código consulta y que el baseline no trae', async () => {
    const sql = (await collectStatements()).join('\n');
    for (const table of [
      'admin_users',
      'agencies',
      'worker_leads',
      'worker_portfolio_photos',
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS "?${table}"?`));
    }
    for (const column of [
      'offered_by_agency_id',
      'agency_id',
      'hourly_rate',
      'daily_rate',
      'work_modalities',
      'client_last_read_at',
      'worker_last_read_at',
      'client_deleted',
      'worker_deleted',
      'cancelled_by',
    ]) {
      expect(sql).toContain(column);
    }
  });

  it('es idempotente: ninguna sentencia falla si el objeto ya existe', async () => {
    const statements = await collectStatements();
    expect(statements.length).toBeGreaterThan(0);
    for (const sql of statements) {
      const guarded =
        /IF NOT EXISTS/i.test(sql) || /\bDO \$\$/.test(sql);
      expect(guarded).toBe(true);
      // Un ADD COLUMN / ADD CONSTRAINT sin guarda rompería el arranque en una
      // base que ya los tenga.
      if (/ADD COLUMN/i.test(sql) && !/\bDO \$\$/.test(sql)) {
        const adds = sql.match(/ADD COLUMN(?! IF NOT EXISTS)/gi) ?? [];
        expect(adds).toHaveLength(0);
      }
    }
  });

  it('no borra datos al revertir', async () => {
    await expect(
      new EnsureCompleteSchema1791600000000().down(),
    ).resolves.toBeUndefined();
  });
});
