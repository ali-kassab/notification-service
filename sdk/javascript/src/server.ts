import { HttpOptions, request, toQuery } from './http.js';
import type {
  InboxNotification,
  ListQuery,
  NotificationContent,
  Paginated,
  SendNotificationInput,
  SendResult,
  UserToken,
} from './types.js';

export interface NotificationClientOptions extends HttpOptions {
  /** Secret project API key (nsk_...). SERVER-SIDE ONLY - never ship it to a browser. */
  apiKey: string;
}

/**
 * Server-side client for trusted backends. Authenticates with a secret project API key.
 *
 * @example
 * const client = new NotificationClient({ apiKey: process.env.NAAS_API_KEY!, baseUrl: 'https://naas.example.com' });
 * await client.send({ userId: 'user-123', title: 'Payment Successful', message: 'Thanks!', type: 'SUCCESS' });
 */
export class NotificationClient {
  private readonly opts: NotificationClientOptions;

  constructor(options: NotificationClientOptions) {
    if (!options?.apiKey) throw new Error('apiKey is required');
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      // Secret keys must never be used from browser code.
      console.warn(
        '[notification-service-sdk] NotificationClient uses a secret API key and must only run on a server. ' +
          'In the browser use NotificationInbox from "notification-service-sdk/browser" with a user token.',
      );
    }
    this.opts = options;
  }

  private call<T>(method: string, path: string, body?: unknown): Promise<T> {
    return request<T>(this.opts, method, path, { 'x-api-key': this.opts.apiKey }, body);
  }

  /** Send a notification to one user (`userId`) or several users (`userIds`). */
  send(input: SendNotificationInput): Promise<SendResult> {
    return this.call('POST', '/notifications', input);
  }

  /** Send a notification to every known user of the project. */
  broadcast(input: NotificationContent): Promise<SendResult> {
    return this.call('POST', '/notifications/broadcast', input);
  }

  /**
   * Issue a short-lived token for one of YOUR users, to hand to their browser.
   * It only grants access to that user's own inbox and real-time stream.
   */
  createUserToken(userId: string, expiresIn?: number): Promise<UserToken> {
    return this.call('POST', '/user-tokens', { userId, expiresIn });
  }

  listNotifications(userId: string, query: ListQuery = {}): Promise<Paginated<InboxNotification>> {
    return this.call('GET', `${this.userPath(userId)}${toQuery({ ...query })}`);
  }

  async getUnreadCount(userId: string): Promise<number> {
    return (await this.call<{ count: number }>('GET', `${this.userPath(userId)}/unread-count`)).count;
  }

  markAsRead(userId: string, notificationId: string): Promise<InboxNotification> {
    return this.call('PATCH', `${this.userPath(userId)}/${encodeURIComponent(notificationId)}/read`);
  }

  markAllAsRead(userId: string): Promise<{ updated: number }> {
    return this.call('PATCH', `${this.userPath(userId)}/read-all`);
  }

  async deleteNotification(userId: string, notificationId: string): Promise<void> {
    await this.call('DELETE', `${this.userPath(userId)}/${encodeURIComponent(notificationId)}`);
  }

  private userPath(userId: string): string {
    return `/users/${encodeURIComponent(userId)}/notifications`;
  }
}
