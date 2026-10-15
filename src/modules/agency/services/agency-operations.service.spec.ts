import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AgencyOperationsService, generateWorkerPassword } from './agency-operations.service';

const AGENCY = 'a0000000-0000-0000-0000-000000000001';
const W1 = 'b0000000-0000-0000-0000-000000000001';
const W2 = 'b0000000-0000-0000-0000-000000000002';

/** Responde según el SQL; lo que no se reconoce devuelve []. */
function build(routes: Array<[string, any]>) {
  const query = jest.fn(async (sql: string, _args?: unknown[]): Promise<any> => {
    void _args;
    const hit = routes.find(([needle]) => sql.includes(needle));
    return hit ? (typeof hit[1] === 'function' ? hit[1](sql) : hit[1]) : [];
  });
  const manager = { query };
  const dataSource = {
    query,
    transaction: jest.fn(async (fn: (m: typeof manager) => Promise<unknown>) => fn(manager)),
  };
  const notifications = { broadcastPush: jest.fn().mockResolvedValue(2) };
  const realtime = { emitToUser: jest.fn() };
  const service = new AgencyOperationsService(dataSource as any, notifications as any, realtime as any);
  return { service, query, notifications, realtime };
}

const ledgerRow = (over: Partial<Record<string, any>>) => ({
  request_id: 'r1',
  title: 'Limpieza',
  worker_user_id: W1,
  worker_name: 'Jorge Peña',
  completed_at: '2026-10-10T12:00:00Z',
  amount: '200.00',
  is_digital: false,
  worker_rate: 20,
  chamba_rate: 10,
  ...over,
});

describe('AgencyOperationsService', () => {
  it('genera contraseñas fáciles de dictar y de 8+ caracteres', () => {
    const pass = generateWorkerPassword();
    expect(pass).toMatch(/^chamba-\d{4}-[a-z]{2}$/);
    expect(pass.length).toBeGreaterThanOrEqual(8);
  });

  describe('crear trabajador', () => {
    it('crea la cuenta vinculada a la agencia y devuelve la contraseña una vez', async () => {
      const { service, query } = build([
        ['SELECT id FROM users', []],
        ['INSERT INTO users', [{ id: W1 }]],
      ]);
      const result = await service.createWorker(AGENCY, {
        firstName: 'Jorge',
        email: ' Jorge@CleanPro.com ',
        phone: '700-00-000',
        skills: ['Limpieza', 'Limpieza', ''],
        commissionRate: 15,
      });
      expect(result).toMatchObject({ workerId: W1, email: 'jorge@cleanpro.com', phone: '70000000' });
      expect(result.password).toMatch(/^chamba-/);

      const insertUser = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO users'))!;
      expect(insertUser[0]).toContain('is_agency_worker');
      expect((insertUser as any)[1]).toContain(AGENCY);
      const cred = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO auth_credentials'))!;
      expect((cred as any)[1][1]).not.toBe(result.password); // se guarda cifrada
      expect(query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO worker_skills'))).toHaveLength(1);
      expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO agency_worker_terms'))).toBe(true);
    });

    it('no duplica cuentas y explica cómo vincular', async () => {
      const { service } = build([['SELECT id FROM users', [{ id: 'otro' }]]]);
      await expect(
        service.createWorker(AGENCY, { firstName: 'Ana', email: 'ana@mail.com' }),
      ).rejects.toThrow(ConflictException);
    });

    it('valida correo y contraseña', async () => {
      const { service } = build([]);
      await expect(service.createWorker(AGENCY, { firstName: 'Ana', email: 'ana' })).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        service.createWorker(AGENCY, { firstName: 'Ana', email: 'ana@mail.com', password: 'corta' }),
      ).rejects.toThrow('8 caracteres');
    });
  });

  it('restablecer contraseña solo para trabajadores propios', async () => {
    const ajena = build([]);
    await expect(ajena.service.resetWorkerPassword(AGENCY, W1)).rejects.toThrow(NotFoundException);

    const propia = build([['FROM users', [{ id: W1, email: 'jorge@mail.com', phone: null }]]]);
    const result = await propia.service.resetWorkerPassword(AGENCY, W1);
    expect(result.email).toBe('jorge@mail.com');
    expect(result.password).toMatch(/^chamba-/);
    expect(propia.query.mock.calls.some(([sql]) => sql.includes('ON CONFLICT (user_id) DO UPDATE'))).toBe(true);
  });

  it('comisión por trabajador: rango 0–100 y null vuelve a la general', async () => {
    const { service, query } = build([['FROM users', [{ id: W1 }]]]);
    await expect(service.setWorkerCommission(AGENCY, W1, 120)).rejects.toThrow('entre 0 y 100');
    await expect(service.setWorkerCommission(AGENCY, W1, 12.5)).resolves.toEqual({
      workerId: W1,
      commissionRate: 12.5,
    });
    await expect(service.setWorkerCommission(AGENCY, W1, null)).resolves.toEqual({
      workerId: W1,
      commissionRate: null,
    });
    expect(query.mock.calls.some(([sql]) => sql.includes('DELETE FROM agency_worker_terms'))).toBe(true);
  });

  describe('avisos', () => {
    it('envía a los trabajadores propios con push y guarda el historial', async () => {
      const { service, notifications, realtime } = build([
        ['SELECT name FROM agencies', [{ name: 'CleanPro' }]],
        ['INSERT INTO notifications', [{ id: W1 }, { id: W2 }]],
        ['FROM push_tokens', [{ token: 't1' }, { token: 't2' }]],
        ['INSERT INTO agency_messages', [{ id: 'm1', created_at: '2026-10-15' }]],
      ]);
      const sent = await service.sendMessage(AGENCY, { title: 'Reunión', body: 'Lunes 8am', workerIds: 'all' });
      expect(sent).toMatchObject({ recipients: 2, pushed: 2 });
      expect(realtime.emitToUser).toHaveBeenCalledTimes(2);
      expect(notifications.broadcastPush).toHaveBeenCalledWith({
        tokens: ['t1', 't2'],
        title: 'CleanPro: Reunión',
        body: 'Lunes 8am',
      });
    });

    it('rechaza mensajes vacíos o sin destinatarios válidos', async () => {
      const { service } = build([['SELECT name FROM agencies', [{ name: 'X' }]]]);
      await expect(service.sendMessage(AGENCY, { title: '', body: 'x' })).rejects.toThrow(BadRequestException);
      await expect(service.sendMessage(AGENCY, { title: 'a', body: 'b', workerIds: [] })).rejects.toThrow(
        'al menos un trabajador',
      );
      await expect(service.sendMessage(AGENCY, { title: 'a', body: 'b', workerIds: [W1] })).rejects.toThrow(
        'Ninguno',
      );
    });
  });

  describe('dinero', () => {
    const jobs = [
      ledgerRow({ request_id: 'r1', amount: '200.00', is_digital: false }), // efectivo
      ledgerRow({ request_id: 'r2', amount: '100.00', is_digital: true }), // QR/tarjeta
      ledgerRow({ request_id: 'r3', worker_user_id: W2, worker_name: 'Ana', amount: '50.00', worker_rate: 10, is_digital: true }),
    ];

    it('saldo con cada trabajador: lo que le toca menos lo pagado', async () => {
      const { service } = build([
        ['FROM agency_job_ledger', jobs],
        ['FROM agency_payouts', [{ id: 'p1', worker_user_id: W1, amount: '100', kind: 'paid', paid_at: '2026-10-11', worker_name: 'Jorge Peña' }]],
        ['is_agency_worker = true AND type', [{ id: W1, name: 'Jorge Peña' }, { id: W2, name: 'Ana' }]],
        ['FROM agency_worker_terms', [{ worker_user_id: W2, commission_rate: 10 }]],
      ]);
      const result = await service.getPayouts(AGENCY);
      const jorge: any = result.workers.find((w: any) => w.workerId === W1);
      const ana: any = result.workers.find((w: any) => w.workerId === W2);
      // Jorge: 300 generados, 20% agencia = 60, le tocan 240, pagado 100.
      expect(jorge).toMatchObject({ jobsCount: 2, generated: 300, agencyCut: 60, earned: 240, paid: 100, balance: 140 });
      // Ana: 50 con su 10% = 5, le tocan 45.
      expect(ana).toMatchObject({ earned: 45, balance: 45, commissionRate: 10 });
      expect(result.summary).toMatchObject({ owedToWorkers: 185, owedByWorkers: 0, paidTotal: 100 });
    });

    it('cuenta con Chamba: digitales a favor, comisión de efectivo en contra, liquidaciones descuentan', async () => {
      const { service, query } = build([
        ['FROM agency_job_ledger', jobs],
        ['FROM agency_settlements', [{ id: 's1', direction: 'to_agency', amount: '50', note: null, created_at: '2026-10-12' }]],
      ]);
      const account = await service.getChambaAccount(AGENCY);
      // Digitales: 150 cobrados por Chamba − 15 de comisión = 135 a favor.
      // Efectivo: 200 × 10% = 20 que la agencia le debe a Chamba.
      // Ya se le pagaron 50 → saldo 135 − 20 − 50 = 65.
      expect(account.summary).toMatchObject({
        digitalCollected: 150,
        digitalFees: 15,
        cashFees: 20,
        paidToAgency: 50,
        balance: 65,
      });
      expect(account.jobs.find((j: any) => j.requestId === 'r1')!.effect).toBe(-20);
      expect(account.jobs.find((j: any) => j.requestId === 'r2')!.effect).toBe(90);
      // El libro se sincroniza antes de leer (montos congelados).
      expect(query.mock.calls[0][0]).toContain('INSERT INTO agency_job_ledger');
      expect(query.mock.calls[0][0]).toContain('ON CONFLICT (request_id) DO NOTHING');
    });

    it('pagos a trabajadores: solo propios y montos positivos', async () => {
      const ajena = build([]);
      await expect(ajena.service.createPayout(AGENCY, { workerId: W1, amount: 10 })).rejects.toThrow(
        NotFoundException,
      );
      const propia = build([
        ['FROM users', [{ id: W1 }]],
        ['INSERT INTO agency_payouts', [{ id: 'p9' }]],
      ]);
      await expect(propia.service.createPayout(AGENCY, { workerId: W1, amount: 0 })).rejects.toThrow('mayor a 0');
      await expect(
        propia.service.createPayout(AGENCY, { workerId: W1, amount: 80, kind: 'kept_cash' }),
      ).resolves.toEqual({ id: 'p9' });
      const insert = propia.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO agency_payouts'))!;
      expect((insert as any)[1]).toEqual(expect.arrayContaining([AGENCY, W1, 80, 'kept_cash']));
    });

    it('liquidación del admin: dirección y monto válidos', async () => {
      const { service } = build([['SELECT id FROM agencies', [{ id: AGENCY }]]]);
      await expect(service.createSettlement(AGENCY, null, { direction: 'x', amount: 5 })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createSettlement(AGENCY, null, { direction: 'to_agency', amount: -1 })).rejects.toThrow(
        'mayor a 0',
      );
    });
  });
});
