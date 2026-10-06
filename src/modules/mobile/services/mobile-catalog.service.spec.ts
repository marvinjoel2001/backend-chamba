import { MobileCatalogService } from './mobile-catalog.service';

describe('Category permissions', () => {
  const category = { id: 'pintura', name: 'Pintura', is_active: true };
  let db: any, service: MobileCatalogService;
  beforeEach(() => {
    db = { query: jest.fn() };
    service = new MobileCatalogService(db, { toCategoryId: () => 'pintura' } as any);
  });
  it('a worker can select an existing category without overwriting its metadata', async () => {
    db.query.mockResolvedValueOnce([]).mockResolvedValueOnce([category]);
    expect((await service.createCategory({ name: 'Pintura', createOnly: true })).category.name).toBe('Pintura');
    expect(db.query.mock.calls[0][0]).toContain('DO NOTHING');
    expect(db.query.mock.calls[0][0]).not.toContain('DO UPDATE SET');
  });
  it('the administrator retains category management', async () => {
    db.query.mockResolvedValueOnce([category]);
    await service.createCategory({ name: 'Pintura', description: 'Nuevos detalles' });
    expect(db.query.mock.calls[0][0]).toContain('DO UPDATE SET');
    expect(db.query.mock.calls[0][1][2]).toBe('Nuevos detalles');
  });
});
