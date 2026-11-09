import { BadRequestException } from '@nestjs/common';
import { MobileService } from '../mobile.service';
import {
  publicJobTitle,
  publicMaterialsMode,
  publicStartDate,
} from './public-jobs.service';
import { WorkModalitiesService } from './work-modalities.service';

/** app_config en memoria. */
function fakeConfig(initial?: Record<string, unknown>) {
  let stored: unknown = initial ? JSON.stringify(initial) : undefined;
  const query = jest.fn(async (sql: string, args: unknown[] = []) => {
    if (sql.startsWith('SELECT value_json'))
      return stored ? [{ value_json: stored }] : [];
    if (sql.includes('INSERT INTO app_config')) stored = args[1];
    return [];
  });
  return {
    query,
    stored: () => (typeof stored === 'string' ? JSON.parse(stored) : null),
  };
}

describe('Modalidades de contratación (admin)', () => {
  it('sin configuración, las tres están activas', async () => {
    const service = new WorkModalitiesService(fakeConfig() as any);
    await expect(service.get()).resolves.toEqual({
      fixed: true,
      hourly: true,
      daily: true,
    });
  });

  it('el admin apaga una y queda guardado; lo que no manda se mantiene', async () => {
    const db = fakeConfig();
    const service = new WorkModalitiesService(db as any);
    await expect(service.update({ hourly: false })).resolves.toEqual({
      fixed: true,
      hourly: false,
      daily: true,
    });
    expect(db.stored()).toEqual({ fixed: true, hourly: false, daily: true });
    await expect(service.update({ daily: 'false' as any })).resolves.toEqual({
      fixed: true,
      hourly: false,
      daily: false,
    });
  });

  it('no deja apagar todas', async () => {
    const service = new WorkModalitiesService(
      fakeConfig({ fixed: true, hourly: false, daily: false }) as any,
    );
    await expect(service.update({ fixed: false })).rejects.toThrow(
      'al menos una modalidad',
    );
  });

  it('una modalidad apagada no se puede usar ni guardar', async () => {
    const service = new WorkModalitiesService(
      fakeConfig({ hourly: false }) as any,
    );
    await expect(service.assertEnabled('hourly')).rejects.toThrow(
      '"Por hora" no está disponible',
    );
    await expect(service.assertEnabled('fixed')).resolves.toBeUndefined();
    await expect(
      service.keepEnabled(['fixed', 'hourly', 'daily', 'otra']),
    ).resolves.toEqual(['fixed', 'daily']);
  });

  describe('al crear una solicitud', () => {
    function build(settings: Record<string, unknown>) {
      const requests = { createRequest: jest.fn(async (input) => input) };
      const args: any[] = Array(18).fill({});
      args[5] = {
        normalizePriceTypeKey: (p?: string) =>
          String(p).includes('hora')
            ? 'hour'
            : String(p).includes('dia')
              ? 'day'
              : 'fixed',
      };
      args[11] = requests;
      args[14] = { verifyUploadTicket: () => null };
      args[17] = new WorkModalitiesService(fakeConfig(settings) as any);
      return {
        service: new MobileService(
          ...(args as ConstructorParameters<typeof MobileService>),
        ),
        requests,
      };
    }

    it('rechaza una modalidad apagada aunque una app vieja la muestre', async () => {
      const { service, requests } = build({ hourly: false });
      await expect(
        service.createRequest({
          clientUserId: 'c1',
          modality: 'hourly',
          priceType: 'Por hora',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(requests.createRequest).not.toHaveBeenCalled();
    });

    it('sin modalidad la deduce del tipo de precio', async () => {
      const { service } = build({ daily: false });
      await expect(
        service.createRequest({
          clientUserId: 'c1',
          priceType: 'Por dia',
        } as any),
      ).rejects.toThrow('Por día');
    });

    it('con la modalidad activa crea la solicitud', async () => {
      const { service, requests } = build({ hourly: false });
      await service.createRequest({
        clientUserId: 'c1',
        modality: 'fixed',
        priceType: 'fixed',
      } as any);
      expect(requests.createRequest).toHaveBeenCalled();
    });
  });
});

describe('Título público de un trabajo', () => {
  it('quita correos y números largos (teléfonos, direcciones) y lo acorta', () => {
    expect(
      publicJobTitle('Plomero urgente, llamar al 77712345 o juan@mail.com'),
    ).toBe('Plomero urgente, llamar al … o');
    expect(publicJobTitle('Pintar casa en calle Sucre #123456')).toBe(
      'Pintar casa en calle Sucre #…',
    );
    expect(publicJobTitle('   ')).toBe('Trabajo');
    const long = publicJobTitle(
      'Necesito a alguien para pintar todas las paredes del departamento y arreglar la puerta',
    );
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('Materiales y fecha de inicio en la lista pública', () => {
  it('solo pasa los dos modos que entiende la web', () => {
    expect(publicMaterialsMode('worker')).toBe('worker');
    expect(publicMaterialsMode('client')).toBe('client');
    expect(publicMaterialsMode('discuss')).toBeNull();
    expect(publicMaterialsMode(null)).toBeNull();
  });
  it('la fecha de inicio va sin segundos y nada raro pasa', () => {
    expect(publicStartDate('2026-11-10T08:00:00')).toBe('2026-11-10T08:00');
    expect(publicStartDate('2026-11-10')).toBe('2026-11-10');
    expect(publicStartDate('mañana')).toBeNull();
    expect(publicStartDate(null)).toBeNull();
  });
});
