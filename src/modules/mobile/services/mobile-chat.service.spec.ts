import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MobileChatService } from './mobile-chat.service';

describe('Contextual job chat', () => {
  const thread = {
    id: 'thread',
    request_id: 'job',
    client_user_id: 'client',
    worker_user_id: 'worker',
    status: 'assigned',
    title: 'Plomería',
    amount: 150,
  };
  let db: any,
    manager: any,
    realtime: any,
    photo: any,
    storage: any,
    service: MobileChatService;
  beforeEach(() => {
    manager = { query: jest.fn().mockResolvedValue([]) };
    db = {
      query: jest.fn().mockResolvedValue([thread]),
      transaction: jest.fn((fn) => fn(manager)),
    };
    realtime = { emitToUser: jest.fn() };
    photo = {
      validate: jest.fn().mockResolvedValue(Buffer.from('safe-photo')),
    };
    storage = {
      uploadBase64Image: jest
        .fn()
        .mockResolvedValue({
          url: 'https://res.cloudinary.com/chamba/image/upload/photo.jpg',
          publicId: 'photo',
        }),
      deleteImage: jest.fn().mockResolvedValue(undefined),
    };
    service = new MobileChatService(
      db,
      {} as any,
      realtime,
      {} as any,
      photo,
      storage,
    );
    jest
      .spyOn(service, 'notifyRecipientOfNewMessage')
      .mockResolvedValue(undefined);
  });
  const send = (content = 'Ingreso por la puerta azul') =>
    service.sendMessage({
      threadId: 'thread',
      senderUserId: 'worker',
      content,
    });
  it('rejects contact text before persistence or realtime publication', async () => {
    await expect(send('Mi teléfono es 72177549')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(db.transaction).not.toHaveBeenCalled();
    expect(realtime.emitToUser).not.toHaveBeenCalled();
  });
  it('rejects fake photos and external media URLs sent as text', async () => {
    await expect(
      send('[Foto]\nhttps://res.cloudinary.com/attacker/photo.jpg'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it.each(['searching', 'negotiating', 'expired', 'unknown'])(
    'denies a %s job',
    async (status) => {
      manager.query.mockResolvedValueOnce([{ ...thread, status }]);
      await expect(send()).rejects.toBeInstanceOf(ForbiddenException);
      expect(manager.query).toHaveBeenCalledTimes(1);
    },
  );
  it('denies non-members and offers that were never accepted', async () => {
    manager.query.mockResolvedValueOnce([]);
    await expect(send()).rejects.toBeInstanceOf(ForbiddenException);
    expect(manager.query.mock.calls[0][0]).toContain("jo.status = 'accepted'");
    expect(manager.query.mock.calls[0][1]).toEqual(['thread', 'worker']);
  });
  it.each(['completed', 'cancelled'])(
    'preserves history and refuses new sends for %s',
    async (status) => {
      manager.query.mockResolvedValueOnce([{ ...thread, status }]);
      await expect(send()).rejects.toBeInstanceOf(BadRequestException);
      expect(manager.query).toHaveBeenCalledTimes(1);
      db.query
        .mockResolvedValueOnce([{ ...thread, status }])
        .mockResolvedValueOnce([
          {
            id: 'old',
            sender_user_id: 'client',
            content: 'Entrada azul',
            created_at: '2026-10-06T12:00:00Z',
          },
        ]);
      const page = await service.getThreadMessages('thread', {
        userId: 'client',
      });
      expect(page.context.canSend).toBe(false);
      expect(page.context.type).toBe('archived');
      expect(page.messages[0].content).toBe('Entrada azul');
    },
  );
  it('locks the job through insertion and publishes only the persisted message', async () => {
    manager.query
      .mockResolvedValueOnce([thread])
      .mockResolvedValueOnce([
        {
          id: 'new',
          sender_user_id: 'worker',
          content: 'Ingreso por la puerta azul',
          created_at: new Date(),
        },
      ])
      .mockResolvedValueOnce([]);
    const result = await send();
    expect(manager.query.mock.calls[0][0]).toContain('FOR UPDATE OF jr');
    expect(result.message.threadId).toBe('thread');
    expect(realtime.emitToUser).toHaveBeenCalledWith(
      'client',
      'message.new',
      expect.objectContaining({ requestId: 'job' }),
    );
  });
  it('preserves history instead of deleting a thread', async () => {
    await expect(
      service.deleteThread({ threadId: 'thread', userId: 'client' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('paginates timeline facts with real messages and does not repeat newer events', async () => {
    db.query.mockResolvedValueOnce([{ ...thread, deal_confirmed_at: '2026-10-09T12:00:00Z',
      work_started_at: '2026-10-09T12:02:00Z' }]).mockResolvedValueOnce([
      { id: 'message', sender_user_id: 'client', content: 'Entrada azul', created_at: '2026-10-09T12:01:00Z' },
    ]);
    const page = await service.getThreadMessages('thread', { userId: 'client', before: '2026-10-09T12:02:00Z', limit: 1 });
    expect(page.hasMore).toBe(true);
    expect(page.messages[0]).toMatchObject({ id: 'message', senderUserId: 'client', type: 'text' });
    db.query.mockResolvedValueOnce([{ ...thread, deal_confirmed_at: '2026-10-09T12:00:00Z',
      work_started_at: '2026-10-09T12:02:00Z' }]).mockResolvedValueOnce([]);
    const older = await service.getThreadMessages('thread', { userId: 'client', before: '2026-10-09T12:01:00Z', limit: 1 });
    expect(older.messages[0]).toMatchObject({ type: 'system', senderUserId: 'system', systemEvent: 'deal_confirmed' });
    expect(older.hasMore).toBe(false);
  });
  it('validates the photo and caption before uploading', async () => {
    await expect(
      service.sendPhoto({
        threadId: 'thread',
        senderUserId: 'worker',
        imageBase64: 'image',
        caption: 'WhatsApp',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(photo.validate).not.toHaveBeenCalled();
    expect(storage.uploadBase64Image).not.toHaveBeenCalled();
    photo.validate.mockRejectedValueOnce(
      new BadRequestException('Por tu seguridad'),
    );
    await expect(
      service.sendPhoto({
        threadId: 'thread',
        senderUserId: 'worker',
        imageBase64: 'image',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.uploadBase64Image).not.toHaveBeenCalled();
  });
  it('rechecks job closure after photo review and cleans the unused upload', async () => {
    manager.query.mockResolvedValueOnce([{ ...thread, status: 'completed' }]);
    await expect(
      service.sendPhoto({
        threadId: 'thread',
        senderUserId: 'worker',
        imageBase64: 'image',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.deleteImage).toHaveBeenCalledWith('photo');
    expect(realtime.emitToUser).not.toHaveBeenCalled();
  });
});
