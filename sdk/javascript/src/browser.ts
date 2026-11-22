import { io, Socket } from 'socket.io-client';
import { HttpOptions, NotificationServiceError, normalizeBaseUrl, request, toQuery } from './http.js';
import type { InboxNotification, InboxUpdate, ListQuery, Paginated } from './types.js';

export { NotificationServiceError } from './http.js';
export type * from './types.js';

/** A user token string, or a function that fetches a fresh one from YOUR backend. */
export type TokenSource = string | (() => Promise<string>);

export interface NotificationInboxOptions extends HttpOptions {
  /**
   * Restricted user token issued by your backend via `NotificationClient.createUserToken()`.
   * Pass a function to transparently refresh expired tokens.
   */
  token: TokenSource;
}

export interface SubscribeHandlers {
  /** A new notification arrived in real time. It is acknowledged automatically. */
  onNotification?: (notification: InboxNotification) => void;
  /** Inbox changed (new / read / read_all / deleted), from any tab or device. */
  onInboxUpdated?: (update: InboxUpdate) => void;
  /** Connected and authenticated; fires again after every reconnect. */
  onConnected?: (info: { userId: string; unreadCount: number }) => void;
  onDisconnected?: (reason: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Browser-safe client for ONE end user's inbox. Uses a short-lived user token,
 * never a secret API key, and cannot send notifications.
 */
export class NotificationInbox {
  private readonly opts: NotificationInboxOptions;
  private cachedToken?: string;

  constructor(options: NotificationInboxOptions) {
    if (!options?.token) throw new Error('token is required');
    if (typeof options.token === 'string' && options.token.startsWith('nsk_')) {
      throw new Error('Never use a secret API key in the browser. Pass a user token instead.');
    }
    this.opts = options;
  }

  list(query: ListQuery = {}): Promise<Paginated<InboxNotification>> {
    return this.call('GET', `/client/notifications${toQuery({ ...query })}`);
  }

  async unreadCount(): Promise<number> {
    return (await this.call<{ count: number }>('GET', '/client/notifications/unread-count')).count;
  }

  markAsRead(id: string): Promise<InboxNotification> {
    return this.call('PATCH', `/client/notifications/${encodeURIComponent(id)}/read`);
  }

  markAllAsRead(): Promise<{ updated: number }> {
    return this.call('PATCH', '/client/notifications/read-all');
  }

  async delete(id: string): Promise<void> {
    await this.call('DELETE', `/client/notifications/${encodeURIComponent(id)}`);
  }

  /**
   * Opens a Socket.IO connection for real-time notifications. Reconnects automatically
   * (fetching a fresh token each time when `token` is a function).
   * Returns a function that closes the connection.
   *
   * Real-time events are a fast path only: after (re)connecting, call `list()` to load
   * anything that arrived while the user was offline.
   */
  subscribe(handlers: SubscribeHandlers): () => void {
    const socket: Socket = io(`${normalizeBaseUrl(this.opts.baseUrl)}/notifications`, {
      transports: ['websocket', 'polling'],
      auth: (cb) => {
        this.getToken()
          .then((token) => cb({ token }))
          .catch((e) => {
            handlers.onError?.(e as Error);
            cb({ token: '' });
          });
      },
    });

    let authRetryDelay = 1000;
    socket.on('ready', (info: { userId: string; unreadCount: number }) => {
      authRetryDelay = 1000;
      handlers.onConnected?.(info);
    });
    socket.on('notification', (n: InboxNotification, ack?: (r: unknown) => void) => {
      try {
        handlers.onNotification?.(n);
      } finally {
        ack?.({ received: true }); // lets the service record the notification as DELIVERED
      }
    });
    socket.on('inbox_updated', (u: InboxUpdate) => handlers.onInboxUpdated?.(u));
    socket.on('auth_error', (e: { message: string }) => {
      this.cachedToken = undefined; // force a fresh token on the next attempt
      handlers.onError?.(new Error(e.message));
      // The server closed the connection. Retry with a fresh token (with backoff) if we can refresh.
      if (typeof this.opts.token === 'function') {
        setTimeout(() => socket.connect(), authRetryDelay);
        authRetryDelay = Math.min(authRetryDelay * 2, 30_000);
      }
    });
    socket.on('disconnect', (reason) => handlers.onDisconnected?.(reason));
    socket.on('connect_error', (e) => handlers.onError?.(e));

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }

  private async getToken(forceRefresh = false): Promise<string> {
    if (typeof this.opts.token === 'string') return this.opts.token;
    if (!this.cachedToken || forceRefresh) this.cachedToken = await this.opts.token();
    return this.cachedToken;
  }

  private async call<T>(method: string, path: string): Promise<T> {
    const run = async (token: string) =>
      request<T>(this.opts, method, path, { Authorization: `Bearer ${token}` });
    try {
      return await run(await this.getToken());
    } catch (e) {
      // Expired token + refreshable source: fetch a new token and retry once.
      if (e instanceof NotificationServiceError && e.status === 401 && typeof this.opts.token === 'function') {
        return run(await this.getToken(true));
      }
      throw e;
    }
  }
}
