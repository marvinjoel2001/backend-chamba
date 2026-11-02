import { ConfigService } from '@nestjs/config';
import {
  phoneE164,
  PhoneVerificationService,
} from './phone-verification.service';
const verifyIdToken = jest.fn();
jest.mock('firebase-admin/app', () => ({
  getApps: () => [{ name: 'chamba-phone' }],
  initializeApp: jest.fn(),
}));
jest.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken }),
}));

describe('Phone verification at signup', () => {
  const token = 'google-signed-id-token';
  let service: PhoneVerificationService;
  beforeEach(() => {
    service = new PhoneVerificationService(
      new ConfigService({
        PHONE_VERIFICATION_REQUIRED: true,
        FIREBASE_PROJECT_ID: 'chamba-9f6db',
      }),
    );
    verifyIdToken
      .mockReset()
      .mockResolvedValue({
        uid: 'firebase-user',
        phone_number: '+59170000000',
        auth_time: Date.now() / 1000,
        firebase: { sign_in_provider: 'phone' },
      });
  });
  it('normalizes Bolivia and international E.164 numbers', () => {
    expect(phoneE164('70000000')).toBe('+59170000000');
    expect(phoneE164('+591 700 00000')).toBe('+59170000000');
    expect(phoneE164('+5491112345678')).toBe('+5491112345678');
    expect(() => phoneE164('')).toThrow();
  });
  it('requires a proof for every new signup when enabled', async () => {
    await expect(service.verify({ phone: '70000000' })).rejects.toThrow(
      'Verifica',
    );
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
  it('verifies the signed token with Firebase and binds the account to the proven number', async () => {
    await expect(
      service.verify({ phone: '70000000', phoneIdToken: token }),
    ).resolves.toEqual({ e164: '+59170000000', uid: 'firebase-user' });
    expect(verifyIdToken).toHaveBeenCalledWith(token);
  });
  it.each([
    { phone_number: '+59171111111' },
    { auth_time: Date.now() / 1000 - 1200 },
    { auth_time: Date.now() / 1000 + 1200 },
    { firebase: { sign_in_provider: 'google.com' } },
    { phone_number: undefined },
    { auth_time: undefined },
  ])('rejects mismatched, old or non-phone proofs: %p', async (claims) => {
    verifyIdToken.mockResolvedValue({
      uid: 'firebase-user',
      phone_number: '+59170000000',
      auth_time: Date.now() / 1000,
      firebase: { sign_in_provider: 'phone' },
      ...claims,
    });
    await expect(
      service.verify({ phone: '70000000', phoneIdToken: token }),
    ).rejects.toThrow('Verifica');
  });
  it('rejects an invalid Google signature rather than trusting client claims', async () => {
    verifyIdToken.mockRejectedValue({ code: 'auth/argument-error' });
    await expect(
      service.verify({ phone: '70000000', phoneIdToken: token }),
    ).rejects.toThrow('inválida');
  });
  it('keeps legacy mobile registration behind the rollout switch; web always requires verification', async () => {
    service = new PhoneVerificationService(
      new ConfigService({ PHONE_VERIFICATION_REQUIRED: false }),
    );
    await expect(service.verify({ phone: '70000000' })).resolves.toBeNull();
    await expect(
      service.verify({ phone: '70000000', source: 'web' }),
    ).rejects.toThrow('Verifica');
  });
});
