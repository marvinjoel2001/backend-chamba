import { JwtService } from '@nestjs/jwt';
import { AccessService } from './access.service';
import { MobileAccessGuard } from './mobile-access.guard';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

describe('Authenticated mobile boundaries', () => {
  const db = { query: jest.fn() };
  const jwt = new JwtService();
  const access = new AccessService(jwt, { get: () => 'test-secret-with-at-least-32-characters' } as any, db as any);
  const userId = 'fe1145aa-5a8f-4f45-8a7e-960a595fa8b0';
  beforeEach(() => db.query.mockReset());
  it('notification details use the accepted/final amount and the assigned worker', async () => {
    db.query.mockResolvedValueOnce([{ id: 'job', status: 'completed', budget: '100', amount: '120',
      worker_id: 'worker', worker_first_name: 'Jorge', client_id: userId, photo_url: 'https://example.com/photo.png' }]);
    const result = await access.notificationRequest(userId, 'job');
    expect(result.request.amount).toBe(120);
    expect(result.request.worker?.firstName).toBe('Jorge');
    expect(result.request.photoUrl).toBe('https://example.com/photo.png');
  });
  it('issues a signed mobile token and verifies the user from the database', async () => {
    db.query.mockResolvedValue([{ type: 'worker', is_blocked: false }]);
    await expect(access.authenticate(access.issueMobile(userId, 'worker'))).resolves.toEqual({ id: userId, kind: 'mobile', role: 'worker' });
  });
  it('rejects forged, expired and registration-only tokens', async () => {
    await expect(access.authenticate('fake-jwt-token-for-now')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(access.authenticate(access.issueGoogleRegistration({ sub: userId }))).rejects.toBeInstanceOf(UnauthorizedException);
    const expired = jwt.sign({ sub: userId, kind: 'mobile' }, { secret: 'test-secret-with-at-least-32-characters', expiresIn: -1 });
    await expect(access.authenticate(expired)).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('rejects blocked users and missing accounts', async () => {
    db.query.mockResolvedValueOnce([{ type: 'client', is_blocked: true }]).mockResolvedValueOnce([]);
    await expect(access.authenticate(access.issueMobile(userId, 'client'))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(access.authenticate(access.issueMobile(userId, 'client'))).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('requires conversation membership rather than just existence', async () => {
    db.query.mockResolvedValue([]);
    await expect(access.assertThread(userId, 'other-thread')).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.query.mock.calls[0][1]).toEqual(['other-thread', userId]);
  });
  it('a user cannot join another user room', async () => {
    await expect(access.canJoinUser({ id: userId, kind: 'mobile' }, 'other-user')).resolves.toBe(false);
    expect(db.query).not.toHaveBeenCalled();
  });

  function context(name: string, req: any) {
    return { getHandler: () => ({ name }), switchToHttp: () => ({ getRequest: () => req }) } as any;
  }
  function request(path: string, body: any = {}, query: any = {}, params: any = {}) {
    return { route: { path }, method: 'POST', body, query, params, headers: { authorization: 'Bearer ' + access.issueMobile(userId, 'worker') } };
  }
  it('rejects another actor in the request body', async () => {
    db.query.mockResolvedValue([{ type: 'worker' }]);
    await expect(new MobileAccessGuard(access).canActivate(context('upsertOffer', request('mobile/offers/counter', { workerUserId: 'other' })))).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rejects mobile access to admin configuration', async () => {
    db.query.mockResolvedValue([{ type: 'worker' }]);
    await expect(new MobileAccessGuard(access).canActivate(context('getStripeConfig', request('mobile/admin/stripe-config')))).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rejects admin impersonation in support messages', async () => {
    db.query.mockResolvedValue([{ type: 'worker' }]);
    await expect(new MobileAccessGuard(access).canActivate(context('sendDisputeMessage', request('mobile/disputes/x/messages', { senderId: userId, senderType: 'admin' })))).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('denies messages from an unrelated thread at the HTTP boundary', async () => {
    db.query.mockResolvedValueOnce([{ type: 'worker' }]).mockResolvedValueOnce([]);
    await expect(new MobileAccessGuard(access).canActivate(context('getThreadMessages', request('mobile/messages/:threadId', {}, {}, { threadId: 'other' })))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
