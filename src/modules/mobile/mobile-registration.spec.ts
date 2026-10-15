import { BadRequestException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { MobileService } from './mobile.service';
import { WorkerLead } from '../worker-leads/entities/worker-lead.entity';

// Exercise real registration/password/login behavior against an isolated database double.
describe('Worker web signup', () => {
  let service: MobileService;
  let manager: any;
  let db: any;
  let account: any;
  let credentials: string;
  const input = { type: 'worker', source: 'web', firstName: 'Juana Perez',
    email: 'JUANA@example.com', phone: '+591 70000000', password: 'chamba-test-123' };

  beforeEach(() => {
    account = undefined;
    credentials = '';
    manager = {
      query: jest.fn(async (sql: string, args: any[]) => {
        if (sql.includes('SELECT id')) return [];
        if (sql.includes('INSERT INTO users')) {
          account = { id: 'new-worker', type: args[0], email: args[1], phone: args[2],
            first_name: args[3], verification_status: 'not_verified', is_available: false };
          return [account];
        }
        if (sql.includes('INSERT INTO auth_credentials')) credentials = args[1];
        return [];
      }),
      create: jest.fn((_entity, values) => values),
      save: jest.fn(async (_entity, values) => values),
    };
    db = { transaction: jest.fn((fn) => fn(manager)),
      query: jest.fn(async () => account ? [{ ...account, password: credentials }] : []) };
    const args: any[] = Array(15).fill({});
    args[1] = db;
    args[4] = { emitToAdmins: jest.fn() };
    args[6] = { normalizePhone: (value: string) => value.replace(/\D/g, '').slice(-8) };
    args[14] = { issueMobile: () => 'signed-token' };
    service = new MobileService(...args as ConstructorParameters<typeof MobileService>);
  });

  it('creates an unverified account with hashed credentials and immediate app login', async () => {
    const result = await service.register(input);
    expect(result.user.type).toBe('worker');
    expect(result.user.verificationStatus).toBe('not_verified');
    expect(result.user.isAvailable).toBe(false);
    expect(credentials).not.toBe(input.password);
    expect(await bcrypt.compare(input.password, credentials)).toBe(true);
    expect(manager.save).toHaveBeenCalledWith(WorkerLead, expect.objectContaining({
      email: 'juana@example.com', whatsapp: '70000000', fullName: input.firstName, isContacted: false,
    }));
    expect((service as any).realtimeGateway.emitToAdmins).toHaveBeenCalledWith(
      'lead.new',
      expect.objectContaining({ email: 'juana@example.com' }),
    );
    const login = await service.login(input.email, input.password);
    expect(login.user.id).toBe(result.user.id);
    expect(login.token).toBe('signed-token');
    expect(login.user.verificationStatus).toBe('not_verified');
  });

  it('does not claim success when follow-up cannot be saved', async () => {
    manager.save.mockRejectedValue(new Error('contact persistence failed'));
    await expect(service.register(input)).rejects.toThrow('contact persistence failed');
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate accounts before saving credentials or contacts', async () => {
    manager.query.mockResolvedValueOnce([{ id: 'existing-worker' }]);
    await expect(service.register(input)).rejects.toBeInstanceOf(ConflictException);
    expect(manager.save).not.toHaveBeenCalled();
    expect(credentials).toBe('');
  });

  it.each([{ email: 'invalid' }, { phone: '' }, { password: 'short' }])(
    'validates essential web fields: %p', async (invalid) => {
      await expect(service.register({ ...input, ...invalid })).rejects.toBeInstanceOf(BadRequestException);
      expect(db.transaction).not.toHaveBeenCalled();
    });

  it('keeps existing mobile signup independent of web follow-up', async () => {
    await service.register({ ...input, source: undefined });
    expect(manager.save).not.toHaveBeenCalled();
  });
});
