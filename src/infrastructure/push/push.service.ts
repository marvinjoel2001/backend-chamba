import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { Messaging, getMessaging } from 'firebase-admin/messaging';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly app: App | null;
  private readonly messaging: Messaging | null;

  constructor(private readonly configService: ConfigService) {
    const privateKey = this.normalizePrivateKey(
      this.configService.get<string>('FIREBASE_PRIVATE_KEY'),
    );
    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');

    if (!privateKey || !projectId || !clientEmail) {
      this.logger.warn(
        'Firebase push disabled: missing FIREBASE_* environment variables.',
      );
      this.app = null;
      this.messaging = null;
      return;
    }

    const existing = getApps().find(
      (currentApp) => currentApp.name === 'chamba',
    );

    this.app =
      existing ||
      initializeApp(
        {
          credential: cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        },
        'chamba',
      );

    this.messaging = getMessaging(this.app);
  }

  isEnabled(): boolean {
    return this.messaging !== null;
  }

  async sendToToken(params: {
    token: string;
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<string | null> {
    if (!this.messaging) {
      return null;
    }

    return this.messaging.send({
      token: params.token,
      notification: {
        title: params.title,
        body: params.body,
      },
      data: params.data,
    });
  }

  async sendToTokens(params: {
    tokens: string[];
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<number> {
    if (!this.messaging || params.tokens.length === 0) {
      return 0;
    }

    const response = await this.messaging.sendEachForMulticast({
      tokens: params.tokens,
      notification: {
        title: params.title,
        body: params.body,
      },
      data: params.data,
    });

    return response.successCount;
  }

  private normalizePrivateKey(privateKey?: string): string | null {
    if (!privateKey) {
      return null;
    }

    return privateKey.replace(/\\n/g, '\n');
  }
}
