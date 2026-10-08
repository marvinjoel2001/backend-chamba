import sharp from 'sharp';
import { MobileWorkerPortfolioService } from './mobile-worker-portfolio.service';
import { MobileUsersService } from './mobile-users.service';
import { MobileAccessGuard } from '../../access/mobile-access.guard';

describe('Worker portfolio', () => {
  const query = jest.fn();
  const transaction = jest.fn();
  const storage = { uploadBase64Image: jest.fn(), deleteImage: jest.fn() };
  const service = new MobileWorkerPortfolioService(
    { query, transaction } as any,
    storage as any,
  );
  const photo = {
    id: 'photo',
    url: 'https://images.example/work.jpg',
    caption: 'Pintura',
    createdAt: '2026-10-07',
  };
  let imageBase64: string;

  beforeAll(async () => {
    const bytes = await sharp({
      create: { width: 12, height: 12, channels: 3, background: '#008800' },
    })
      .png()
      .toBuffer();
    imageBase64 = `data:image/png;base64,${bytes.toString('base64')}`;
  });

  beforeEach(() => {
    jest.resetAllMocks();
    transaction.mockImplementation((callback) => callback({ query }));
    storage.uploadBase64Image.mockResolvedValue({
      url: photo.url,
      publicId: 'owned-image',
    });
    storage.deleteImage.mockResolvedValue(undefined);
  });

  it('lists only the selected worker portfolio without storage identifiers', async () => {
    query
      .mockResolvedValueOnce([{ id: 'worker' }])
      .mockResolvedValueOnce([photo]);
    expect(await service.list('worker')).toEqual({
      photos: [photo],
      maxPhotos: 20,
    });
    expect(query.mock.calls[1][1]).toEqual(['worker']);
    expect(query.mock.calls[1][0]).not.toContain('public_id');
  });

  it('normalizes the image and saves it under the authenticated worker', async () => {
    query
      .mockResolvedValueOnce([{ id: 'worker', total: 0 }])
      .mockResolvedValueOnce([{ id: 'worker' }])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([photo]);
    expect(
      await service.add('worker', { imageBase64, caption: ' Pintura ' }),
    ).toEqual({ photo });
    expect(query.mock.calls[1][0]).toContain('FOR UPDATE');
    expect(query.mock.calls[3][1]).toEqual([
      'worker',
      photo.url,
      'owned-image',
      'Pintura',
    ]);
    const upload = storage.uploadBase64Image.mock.calls[0][0];
    expect(upload.folder).toBe('chamba/portfolio/worker');
    const metadata = await sharp(
      Buffer.from(upload.base64Data.split(',')[1], 'base64'),
    ).metadata();
    expect(metadata.format).toBe('jpeg');
    expect(metadata.exif).toBeUndefined();
  });

  it('rejects non-workers before uploading', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.add('client', { imageBase64 })).rejects.toThrow(
      'Trabajador no encontrado',
    );
    expect(storage.uploadBase64Image).not.toHaveBeenCalled();
  });

  it('enforces the photo limit inside the locked transaction', async () => {
    query
      .mockResolvedValueOnce([{ id: 'worker', total: 19 }])
      .mockResolvedValueOnce([{ id: 'worker' }])
      .mockResolvedValueOnce([{ total: 20 }]);
    await expect(service.add('worker', { imageBase64 })).rejects.toThrow(
      'hasta 20',
    );
    expect(storage.deleteImage).toHaveBeenCalledWith('owned-image');
  });

  it.each([
    '',
    'data:image/svg+xml;base64,AAAA',
    'data:image/jpeg;base64,AAAA',
  ])('rejects invalid images before storing (%s)', async (value) => {
    await expect(
      service.add('worker', { imageBase64: value }),
    ).rejects.toThrow();
    expect(transaction).not.toHaveBeenCalled();
    expect(storage.uploadBase64Image).not.toHaveBeenCalled();
  });

  it('rejects images over the byte limit', async () => {
    const value = `data:image/jpeg;base64,${Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64')}`;
    await expect(service.add('worker', { imageBase64: value })).rejects.toThrow(
      '5 MB',
    );
    expect(storage.uploadBase64Image).not.toHaveBeenCalled();
  });

  it('cleans up the uploaded file if persistence fails', async () => {
    query
      .mockResolvedValueOnce([{ id: 'worker', total: 0 }])
      .mockResolvedValueOnce([{ id: 'worker' }])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockRejectedValueOnce(new Error('DB failed'));
    await expect(service.add('worker', { imageBase64 })).rejects.toThrow(
      'DB failed',
    );
    expect(storage.deleteImage).toHaveBeenCalledWith('owned-image');
  });

  it('cleans up the uploaded file if the transaction commit fails', async () => {
    query
      .mockResolvedValueOnce([{ id: 'worker', total: 0 }])
      .mockResolvedValueOnce([{ id: 'worker' }])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([photo]);
    transaction.mockImplementation(async (callback) => {
      await callback({ query });
      throw new Error('Commit failed');
    });
    await expect(service.add('worker', { imageBase64 })).rejects.toThrow(
      'Commit failed',
    );
    expect(storage.deleteImage).toHaveBeenCalledWith('owned-image');
  });

  it('does not delete another worker photo or storage file', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.remove('worker', 'foreign-photo')).rejects.toThrow(
      'Foto no encontrada',
    );
    expect(query.mock.calls[0][1]).toEqual(['foreign-photo', 'worker']);
    expect(query.mock.calls[0][0]).toContain('worker_user_id = $2');
    expect(storage.deleteImage).not.toHaveBeenCalled();
  });

  it('deletes the owned photo and its file', async () => {
    query.mockResolvedValueOnce([{ public_id: 'owned-image' }]);
    expect(await service.remove('worker', 'photo')).toEqual({ deleted: true });
    expect(storage.deleteImage).toHaveBeenCalledWith('owned-image');
  });

  it('public profile uses worker-published photos instead of client request attachments', async () => {
    query
      .mockResolvedValueOnce([{ id: 'worker', first_name: 'Diego' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([photo]);
    const users = new MobileUsersService(
      { query } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const profile = await users.getWorkerProfile('worker');
    expect(profile.worker.portfolio).toEqual([photo]);
    expect(profile.worker.gallery).toEqual([photo.url]);
    expect(query.mock.calls[3][0]).toContain('worker_portfolio_photos');
    expect(query.mock.calls[3][0]).not.toContain('job_request_photos');
  });

  it('blocks client accounts and forged identities on portfolio routes', async () => {
    const authenticate = jest.fn();
    const guard = new MobileAccessGuard({ authenticate } as any);
    const req = {
      headers: {},
      route: { path: '/mobile/worker/portfolio' },
      method: 'POST',
      body: {},
      query: {},
      params: {},
    };
    const context = {
      getHandler: () => function addWorkerPortfolioPhoto() {},
      switchToHttp: () => ({ getRequest: () => req }),
    } as any;
    authenticate.mockResolvedValue({
      kind: 'mobile',
      role: 'client',
      id: 'client',
    });
    await expect(guard.canActivate(context)).rejects.toThrow();
    authenticate.mockResolvedValue({
      kind: 'mobile',
      role: 'worker',
      id: 'worker',
    });
    expect(await guard.canActivate(context)).toBe(true);
    req.body = { workerUserId: 'other-worker' } as any;
    await expect(guard.canActivate(context)).rejects.toThrow('Identidad ajena');
  });
});
