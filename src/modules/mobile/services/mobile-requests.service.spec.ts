import { MobileRequestsService } from './mobile-requests.service';

/**
 * Índices del arreglo de parámetros que recibe el INSERT en `createRequest`.
 * Deben coincidir con el orden de los placeholders $13..$18 del query.
 */
const PARAM = {
  budget: 5,
  priceType: 6,
  paymentMethod: 11,
  modality: 12,
  estimatedHours: 13,
  hourlyRate: 14,
  days: 15,
  dailyRate: 16,
  startDate: 17,
} as const;

describe('MobileRequestsService.createRequest (modalidades)', () => {
  let service: MobileRequestsService;
  let queryMock: jest.Mock;

  /** Fila simulada que devuelve el INSERT ... RETURNING. */
  const insertedRow = {
    id: 'req-1',
    status: 'searching',
    title: 'Pintar casa',
    budget: '200',
    address: 'Av. Siempre Viva 123',
    ai_categories: '[]',
    created_at: new Date('2026-06-16T00:00:00Z'),
    payment_method: 'Efectivo',
  };

  beforeEach(() => {
    queryMock = jest.fn().mockResolvedValue([insertedRow]);

    const dataSource = { query: queryMock } as any;
    const configService = {} as any;
    const storageService = {} as any;
    const notificationsService = {} as any;
    const realtimeGateway = { server: { emit: jest.fn() } } as any;
    const waveQueueService = {} as any;
    const repo = {
      ensureCategoriesExist: jest.fn().mockResolvedValue(undefined),
      getUserById: jest.fn().mockResolvedValue({ id: 'client-1' }),
      parseAiCategories: jest.fn().mockReturnValue([]),
    } as any;
    const geoHelpers = {
      validateBase64Images: jest.fn().mockReturnValue([]),
      validateUploadedImages: jest.fn().mockReturnValue([]),
      normalizeAiCategories: jest
        .fn()
        .mockReturnValue([{ name: 'Pintura', confidence: 1 }]),
    } as any;
    const catalogService = {} as any;
    const offersService = {} as any;
    const apiLogsService = {} as any;

    service = new MobileRequestsService(
      dataSource,
      configService,
      storageService,
      notificationsService,
      realtimeGateway,
      waveQueueService,
      repo,
      geoHelpers,
      catalogService,
      offersService,
      apiLogsService,
    );

    // Evitamos las ramas con efectos secundarios (subida de fotos y
    // generación de ofertas) para aislar la lógica del INSERT.
    jest.spyOn(service as any, 'uploadRequestPhotos').mockResolvedValue([]);
    jest.spyOn(service as any, 'seedOffersForRequest').mockResolvedValue([]);
  });

  /** Base de un input válido; las pruebas sobreescriben lo de cada modalidad. */
  const baseInput = {
    clientUserId: 'client-1',
    title: 'Pintar casa',
    description: 'Necesito que pinten mi casa',
    address: 'Av. Siempre Viva 123',
    latitude: -17.78,
    longitude: -63.18,
    // Pasamos aiCategories para saltar la clasificación por IA.
    aiCategories: [{ id: '1', name: 'Pintura', confidence: 1 }],
  };

  /** Devuelve el arreglo de parámetros con el que se llamó al INSERT. */
  const insertParams = () => queryMock.mock.calls[0][1] as any[];

  it('modalidad por trabajo (fixed) guarda solo el presupuesto cerrado', async () => {
    await service.createRequest({
      ...baseInput,
      budget: 500,
      priceType: 'fixed',
      modality: 'fixed',
    } as any);

    const params = insertParams();
    expect(params[PARAM.modality]).toBe('fixed');
    expect(params[PARAM.budget]).toBe(500);
    expect(params[PARAM.estimatedHours]).toBeNull();
    expect(params[PARAM.hourlyRate]).toBeNull();
    expect(params[PARAM.days]).toBeNull();
    expect(params[PARAM.dailyRate]).toBeNull();
  });

  it('modalidad por hora persiste horas y tarifa, sin campos de día', async () => {
    await service.createRequest({
      ...baseInput,
      budget: 200,
      priceType: 'hourly',
      modality: 'hourly',
      estimatedHours: 4,
      hourlyRate: 50,
      startDate: '2026-06-20',
    } as any);

    const params = insertParams();
    expect(params[PARAM.modality]).toBe('hourly');
    expect(params[PARAM.estimatedHours]).toBe(4);
    expect(params[PARAM.hourlyRate]).toBe(50);
    expect(params[PARAM.startDate]).toBe('2026-06-20');
    expect(params[PARAM.days]).toBeNull();
    expect(params[PARAM.dailyRate]).toBeNull();
  });

  it('modalidad por día persiste días y tarifa, sin campos de hora', async () => {
    await service.createRequest({
      ...baseInput,
      budget: 360,
      priceType: 'daily',
      modality: 'daily',
      days: 3,
      dailyRate: 120,
      startDate: '2026-06-20',
    } as any);

    const params = insertParams();
    expect(params[PARAM.modality]).toBe('daily');
    expect(params[PARAM.days]).toBe(3);
    expect(params[PARAM.dailyRate]).toBe(120);
    expect(params[PARAM.startDate]).toBe('2026-06-20');
    expect(params[PARAM.estimatedHours]).toBeNull();
    expect(params[PARAM.hourlyRate]).toBeNull();
  });

  it('cae a Efectivo y null cuando no se envían datos de modalidad', async () => {
    await service.createRequest({
      ...baseInput,
      budget: 100,
      priceType: 'fixed',
    } as any);

    const params = insertParams();
    expect(params[PARAM.paymentMethod]).toBe('Efectivo');
    expect(params[PARAM.modality]).toBeNull();
    expect(params[PARAM.estimatedHours]).toBeNull();
    expect(params[PARAM.dailyRate]).toBeNull();
  });

  it('rechaza un presupuesto no positivo antes de tocar la base de datos', async () => {
    await expect(
      service.createRequest({
        ...baseInput,
        budget: 0,
        priceType: 'fixed',
        modality: 'fixed',
      } as any),
    ).rejects.toThrow('budget must be greater than 0');
    expect(queryMock).not.toHaveBeenCalled();
  });
});
