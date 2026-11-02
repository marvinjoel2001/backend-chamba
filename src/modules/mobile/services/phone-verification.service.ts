import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export function phoneE164(input?: string, countryCode?: string): string {
  const raw = String(input ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  const value = raw.startsWith('+')
    ? `+${digits}`
    : /^[67]\d{7}$/.test(digits)
      ? `+591${digits}`
      : /^591[67]\d{7}$/.test(digits)
        ? `+${digits}`
        : countryCode && /^\+\d{1,3}$/.test(countryCode)
          ? `${countryCode}${digits}`
          : '';
  if (!/^\+[1-9]\d{7,14}$/.test(value))
    throw new BadRequestException(
      'Escribe un número de teléfono válido con código de país.',
    );
  return value;
}

@Injectable()
export class PhoneVerificationService {
  constructor(private readonly config: ConfigService) {}

  required(): boolean {
    return this.config.get<boolean>('PHONE_VERIFICATION_REQUIRED', false);
  }

  registrationConfig() {
    return {
      phoneVerificationRequired: this.required(),
      projectId:
        this.config.get<string>('FIREBASE_PROJECT_ID') || 'chamba-9f6db',
    };
  }

  async verify(input: {
    phone?: string;
    countryCode?: string;
    phoneIdToken?: string;
    source?: string;
  }) {
    // Web registrations are already on the new flow. The global switch covers
    // older mobile clients once the SMS provider and mobile release are ready.
    if (!input.phoneIdToken && !this.required() && input.source !== 'web')
      return null;
    if (!input.phoneIdToken || input.phoneIdToken.length > 10000) {
      throw new BadRequestException(
        'Verifica tu número por SMS antes de crear la cuenta.',
      );
    }
    const expected = phoneE164(input.phone, input.countryCode);
    const projectId =
      this.config.get<string>('FIREBASE_PROJECT_ID') || 'chamba-9f6db';
    const app =
      getApps().find((a) => a.name === 'chamba-phone') ||
      initializeApp({ projectId }, 'chamba-phone');
    let token;
    try {
      // This verifies Google's signature, issuer, audience and expiration. A
      // project ID suffices for public certificate verification; no client can
      // supply a project ID or a trusted verified flag.
      token = await getAuth(app).verifyIdToken(input.phoneIdToken);
    } catch (error) {
      if (
        ['app/network-error', 'auth/internal-error'].includes(
          (error as { code?: string }).code ?? '',
        )
      ) {
        throw new ServiceUnavailableException(
          'No se pudo consultar la verificación. Intenta de nuevo.',
        );
      }
      throw new UnauthorizedException(
        'Verificación de teléfono inválida o vencida.',
      );
    }
    if (
      token.firebase?.sign_in_provider !== 'phone' ||
      token.phone_number !== expected ||
      !Number.isFinite(token.auth_time) ||
      token.auth_time > Date.now() / 1000 + 30 ||
      Date.now() / 1000 - token.auth_time > 600
    ) {
      throw new UnauthorizedException(
        'Verifica este mismo número de teléfono de nuevo.',
      );
    }
    return { e164: expected, uid: token.uid };
  }
}
