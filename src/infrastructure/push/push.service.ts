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

    const isCall = params.data?.type === 'request_new';

    const data = params.data ? { ...params.data } : {};

    if (isCall) {
      // La app usa estos campos para reconstruir la alerta local cuando el
      // mensaje llega data-only a su handler de segundo plano.
      data.title = params.title;
      data.body = params.body;
    }

    return this.messaging.send({
      token: params.token,
      notification: isCall
        ? undefined
        : {
            title: params.title,
            body: params.body,
          },
      data: Object.keys(data).length > 0 ? data : undefined,
      android: {
        priority: 'high' as const,
        notification: {
          priority: 'max' as const,
          channelId: isCall
            ? 'chamba_call_channel_v3'
            : 'chamba_default_channel',
          defaultSound: !isCall,
          sound: isCall ? 'chamba_ringtone' : undefined,
          defaultVibrateTimings: true,
        },
      },
      apns: {
        headers: {
          'apns-priority': '10',
        },
        payload: {
          aps: isCall
            ? {
                alert: { title: params.title, body: params.body },
                sound: 'chamba_ringtone.mp3',
                'interruption-level': 'time-sensitive',
              }
            : {
                sound: 'default',
              },
        },
      },
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

    const isCall = params.data?.type === 'request_new';

    const data = params.data ? { ...params.data } : {};

    if (isCall) {
      // La app usa estos campos para reconstruir la alerta local cuando el
      // mensaje llega data-only a su handler de segundo plano.
      data.title = params.title;
      data.body = params.body;
    }

    const response = await this.messaging.sendEachForMulticast({
      tokens: params.tokens,
      notification: isCall
        ? undefined
        : {
            title: params.title,
            body: params.body,
          },
      data: Object.keys(data).length > 0 ? data : undefined,
      android: {
        priority: 'high' as const,
        notification: {
          priority: 'max' as const,
          channelId: isCall
            ? 'chamba_call_channel_v3'
            : 'chamba_default_channel',
          defaultSound: !isCall,
          sound: isCall ? 'chamba_ringtone' : undefined,
          defaultVibrateTimings: true,
        },
      },
      apns: {
        headers: {
          'apns-priority': '10',
        },
        payload: {
          aps: isCall
            ? {
                alert: { title: params.title, body: params.body },
                sound: 'chamba_ringtone.mp3',
                'interruption-level': 'time-sensitive',
              }
            : {
                sound: 'default',
              },
        },
      },
    });

    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          this.logger.error(
            `FCM multicast send failed for token ${params.tokens[idx].substring(0, 20)}...: [${resp.error?.code}] - ${resp.error?.message}`,
          );
        }
      });
    }

    return response.successCount;
  }

  getProjectId(): string | null {
    return this.configService.get<string>('FIREBASE_PROJECT_ID') || null;
  }

  private normalizePrivateKey(privateKey?: string): string | null {
    if (!privateKey) {
      return null;
    }

    return privateKey.replace(/\\n/g, '\n');
  }
}
