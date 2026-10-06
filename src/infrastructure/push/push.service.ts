import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { Messaging, getMessaging } from 'firebase-admin/messaging';
import { DataSource } from 'typeorm';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly app: App | null;
  private readonly messaging: Messaging | null;

  constructor(private readonly configService: ConfigService, private readonly db: DataSource) {
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

  async sendToToken(params: { token: string; title: string; body: string; data?: Record<string, string> }): Promise<string | null> {
    const result = await this.deliverTokens({ ...params, tokens: [params.token] });
    return result.messageIds[0] || null;
  }

  async sendToTokens(params: { tokens: string[]; title: string; body: string; data?: Record<string, string> }): Promise<number> {
    return (await this.deliverTokens(params)).count;
  }

  private async deliverTokens(params: { tokens: string[]; title: string; body: string; data?: Record<string, string> }): Promise<{ count: number; messageIds: string[] }> {
    const messageIds: string[] = [];
    if (!this.messaging) return { count: 0, messageIds };
    const isRequest = params.data?.type === 'request_new';
    const expiresMs = params.data?.expiresAt ? Date.parse(params.data.expiresAt) : NaN;
    if (Number.isFinite(expiresMs) && expiresMs <= Date.now()) return { count: 0, messageIds };
    const ttl = Number.isFinite(expiresMs) ? Math.max(0, Math.min(86400000, expiresMs - Date.now())) : isRequest ? 120000 : 86400000;
    const data: Record<string, string> = { ...params.data, title: params.title, body: params.body };
    const requestId = data.requestId || data.jobId;
    const group = data.threadId ? 'chat:' + data.threadId : requestId ? 'job:' + requestId : data.eventId;
    const tokens = [...new Set(params.tokens.filter(Boolean))];
    let sent = 0;
    for (let offset = 0; offset < tokens.length; offset += 500) {
      const batch = tokens.slice(offset, offset + 500);
      // Retry transient failures only. Invalid tokens are removed, never retried.
      let pending = batch;
      for (let attempt = 0; attempt < 3 && pending.length; attempt++) {
        if (attempt) await new Promise(resolve => setTimeout(resolve, 300 * 2 ** attempt));
        if (Number.isFinite(expiresMs) && expiresMs <= Date.now()) break;
        let response;
        try { response = await this.messaging.sendEachForMulticast({ tokens: pending,
          notification: { title: params.title, body: params.body }, data,
          android: { priority: 'high', ttl, notification: { channelId: 'chamba_default_channel',
            sound: 'default', tag: group } },
          apns: { headers: { 'apns-priority': '10', 'apns-expiration': String(Math.floor((Date.now() + ttl) / 1000)),
              ...(group ? { 'apns-collapse-id': group.slice(0, 64) } : {}) },
            payload: { aps: { sound: 'default', ...(data.threadId ? { 'thread-id': data.threadId } : {}) } } },
        });
        } catch (error) {
          const code = (error as { code?: string }).code;
          this.logger.warn('FCM batch failed: ' + (code || 'transport error'));
          if (code && !['messaging/server-unavailable', 'messaging/internal-error', 'messaging/quota-exceeded', 'app/network-error'].includes(code)) throw error;
          if (attempt === 2) throw error;
          continue;
        }
        sent += response.successCount;
        const retry: string[] = [];
        for (let i = 0; i < response.responses.length; i++) {
          const result = response.responses[i];
          if (result.success) { if (result.messageId) messageIds.push(result.messageId); continue; }
          const code = result.error?.code;
          if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(code || '')) {
            await this.db.query('DELETE FROM push_tokens WHERE token = $1', [pending[i]]);
          } else if (['messaging/server-unavailable', 'messaging/internal-error', 'messaging/quota-exceeded'].includes(code || '')) retry.push(pending[i]);
          this.logger.warn('FCM delivery failed: ' + code);
        }
        pending = retry;
      }
    }
    return { count: sent, messageIds };
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
