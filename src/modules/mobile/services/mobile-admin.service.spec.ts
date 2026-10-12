import { BadRequestException } from '@nestjs/common';
import { MobileAdminService } from './mobile-admin.service';

describe('MobileAdminService – avisos especiales', () => {
  const build = (recipients: string[], tokens: string[] = ['t1', 't2']) => {
    const query = jest
      .fn()
      .mockResolvedValueOnce(recipients.map((id) => ({ id })))
      .mockResolvedValueOnce(tokens.map((token) => ({ token })));
    const broadcastPush = jest.fn().mockResolvedValue(tokens.length);
    const emitToUser = jest.fn();
    const service = new MobileAdminService(
      { query } as any,
      { broadcastPush } as any,
      { emitToUser } as any,
      {} as any,
    );
    return { service, query, broadcastPush, emitToUser };
  };

  it('guarda el aviso en la bandeja de cada trabajador y envía push', async () => {
    const { service, query, broadcastPush, emitToUser } = build(['w1', 'w2', 'w3']);

    const result = await service.broadcastNotification({
      target: 'workers',
      type: 'announcement',
      title: '  Ya hay nuevos empleos  ',
      body: 'Revisa las solicitudes de tu zona.',
    });

    expect(result).toEqual({ success: true, method: 'announcement', saved: 3, count: 2 });
    const [insertSql, insertArgs] = query.mock.calls[0];
    expect(insertSql).toContain('INSERT INTO notifications');
    expect(insertSql).toContain("'announcement'");
    expect(insertSql).toContain('is_blocked');
    expect(insertArgs.slice(0, 4)).toEqual(['workers', [], 'Ya hay nuevos empleos', 'Revisa las solicitudes de tu zona.']);
    expect(JSON.parse(insertArgs[4])).toMatchObject({ type: 'announcement', title: 'Ya hay nuevos empleos' });
    expect(query.mock.calls[1][1]).toEqual([['w1', 'w2', 'w3']]);
    expect(broadcastPush).toHaveBeenCalledWith({
      tokens: ['t1', 't2'],
      title: 'Ya hay nuevos empleos',
      body: 'Revisa las solicitudes de tu zona.',
    });
    expect(emitToUser).toHaveBeenCalledTimes(3);
  });

  it('sin destinatarios no consulta tokens ni envía push', async () => {
    const { service, query, broadcastPush } = build([]);
    const result = await service.broadcastNotification({
      target: 'workers', type: 'announcement', title: 'Hola', body: 'Mensaje',
    });
    expect(result).toEqual({ success: true, method: 'announcement', saved: 0, count: 0 });
    expect(query).toHaveBeenCalledTimes(1);
    expect(broadcastPush).not.toHaveBeenCalled();
  });

  it.each([
    [{ title: '', body: 'x' }, 'obligatorios'],
    [{ title: 'x'.repeat(81), body: 'x' }, '80'],
    [{ title: 'x', body: 'x'.repeat(501) }, '500'],
  ])('valida título y mensaje (%#)', async (fields, message) => {
    const { service, query } = build(['w1']);
    await expect(
      service.broadcastNotification({ target: 'workers', type: 'announcement', ...fields }),
    ).rejects.toThrow(message);
    expect(query).not.toHaveBeenCalled();
  });

  it('personalizado exige usuarios seleccionados', async () => {
    const { service } = build(['w1']);
    await expect(
      service.broadcastNotification({ target: 'custom', type: 'announcement', title: 'a', body: 'b' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
