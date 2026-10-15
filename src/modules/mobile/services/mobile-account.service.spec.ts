import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ACCOUNT_DELETION_GRACE_DAYS, MobileAccountService } from './mobile-account.service';

describe('MobileAccountService – eliminación de cuenta', () => {
  const scheduled = new Date('2026-11-13T12:00:00Z');
  const requested = new Date('2026-10-14T12:00:00Z');

  function build(responses: unknown[]) {
    const query = jest.fn();
    for (const r of responses) query.mockResolvedValueOnce(r);
    const txQuery = jest.fn().mockResolvedValue([{ id: 'u1' }]);
    const transaction = jest.fn(async (fn: (tx: { query: jest.Mock }) => Promise<void>) =>
      fn({ query: txQuery }),
    );
    const service = new MobileAccountService({ query, transaction } as any);
    return { service, query, txQuery, transaction };
  }

  describe('requestDeletion', () => {
    it('programa el borrado a 30 días cuando el correo coincide', async () => {
      const { service, query } = build([
        [{ email: 'Ana@Mail.com', type: 'client', deletion_requested_at: null, deletion_scheduled_for: null }],
        [], // sin trabajos activos
        [{ deletion_requested_at: requested, deletion_scheduled_for: scheduled }],
      ]);
      const status = await service.requestDeletion('u1', '  ana@mail.COM ');
      expect(status).toEqual({
        pending: true,
        requestedAt: requested.toISOString(),
        scheduledFor: scheduled.toISOString(),
      });
      const [sql, args] = query.mock.calls[2];
      expect(sql).toContain('deletion_scheduled_for = NOW() + make_interval(days => $2)');
      expect(args).toEqual(['u1', ACCOUNT_DELETION_GRACE_DAYS]);
    });

    it('rechaza si el correo no coincide y no toca la cuenta', async () => {
      const { service, query } = build([
        [{ email: 'ana@mail.com', type: 'client', deletion_requested_at: null, deletion_scheduled_for: null }],
      ]);
      await expect(service.requestDeletion('u1', 'otra@mail.com')).rejects.toThrow(
        'El correo no coincide',
      );
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('exige escribir el correo', async () => {
      const { service, query } = build([]);
      await expect(service.requestDeletion('u1', '  ')).rejects.toBeInstanceOf(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    });

    it('bloquea si hay un trabajo en curso (trabajador)', async () => {
      const { service, query } = build([
        [{ email: 'jorge@mail.com', type: 'worker', deletion_requested_at: null, deletion_scheduled_for: null }],
        [{ id: 'job-1' }],
      ]);
      await expect(service.requestDeletion('u1', 'jorge@mail.com')).rejects.toThrow('trabajo');
      expect(query.mock.calls[1][0]).toContain("jo.status = 'accepted'");
      expect(query).toHaveBeenCalledTimes(2);
    });

    it('pedirla otra vez no corre el plazo', async () => {
      const { service, query } = build([
        [{ email: 'ana@mail.com', type: 'client', deletion_requested_at: requested, deletion_scheduled_for: scheduled }],
      ]);
      const status = await service.requestDeletion('u1', 'ana@mail.com');
      expect(status.scheduledFor).toBe(scheduled.toISOString());
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('cuenta inexistente o ya eliminada', async () => {
      const { service } = build([[]]);
      await expect(service.requestDeletion('u1', 'a@b.com')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('cancelDeletion limpia la programación', async () => {
    const { service, query } = build([[{ id: 'u1' }]]);
    await expect(service.cancelDeletion('u1')).resolves.toEqual({
      pending: false,
      requestedAt: null,
      scheduledFor: null,
    });
    expect(query.mock.calls[0][0]).toContain('deletion_scheduled_for = NULL');
  });

  describe('purgeDueAccounts', () => {
    it('anonimiza las cuentas vencidas y borra credenciales y tokens', async () => {
      const { service, txQuery } = build([
        [{ id: 'u1', type: 'client' }],
        [], // sin trabajos activos
      ]);
      await expect(service.purgeDueAccounts()).resolves.toBe(1);
      const sql = txQuery.mock.calls.map((c) => c[0] as string);
      expect(sql[0]).toContain("email = 'eliminado+' || id || '@chamba.invalid'");
      expect(sql[0]).toContain('is_blocked = true');
      expect(sql[0]).toContain('deletion_scheduled_for <= NOW()');
      expect(sql[1]).toContain('DELETE FROM auth_credentials');
      expect(sql[2]).toContain('DELETE FROM push_tokens');
    });

    it('posterga el borrado si empezó un trabajo durante la espera', async () => {
      const { service, transaction } = build([
        [{ id: 'u1', type: 'worker' }],
        [{ id: 'job-1' }],
      ]);
      await expect(service.purgeDueAccounts()).resolves.toBe(0);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('no borra credenciales si la cuenta se canceló justo antes', async () => {
      const { service, txQuery } = build([[{ id: 'u1', type: 'client' }], []]);
      txQuery.mockResolvedValueOnce([]); // el UPDATE no encontró la cuenta vencida
      await service.purgeDueAccounts();
      expect(txQuery).toHaveBeenCalledTimes(1);
    });
  });
});
