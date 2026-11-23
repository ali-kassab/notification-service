# notification-service-sdk

A typed JavaScript/TypeScript SDK for the Notification as a Service (NaaS) platform. It is ESM-only, needs Node 18+ or a modern browser, and has a single runtime dependency, `socket.io-client`.

| Entry point | Class | Runs on | Credential |
|---|---|---|---|
| `notification-service-sdk` | `NotificationClient` | your **server** | secret project API key `nsk_...` |
| `notification-service-sdk/browser` | `NotificationInbox` | the **browser** | short-lived user token |

```bash
npm install notification-service-sdk
```

## Server: `NotificationClient`

```ts
import { NotificationClient, NotificationServiceError } from 'notification-service-sdk';

const naas = new NotificationClient({
  apiKey: process.env.NAAS_API_KEY!,   // never ship this to a browser
  baseUrl: 'http://localhost:3000',
  timeoutMs: 10000,                    // optional, default 10000
});

await naas.send({ userId: 'user-123', title: 'Payment Successful', message: 'Thanks!', type: 'SUCCESS' });
await naas.send({ userIds: ['u1', 'u2'], title: 'Team update', message: 'Review at 15:00', priority: 'HIGH' });
await naas.broadcast({ title: 'Maintenance tonight', message: '22:00-23:00 UTC', type: 'WARNING' });

const { token, expiresAt } = await naas.createUserToken('user-123', 3600);   // 60 s - 24 h

await naas.listNotifications('user-123', { page: 1, limit: 20, unread: true, type: 'INFO' });
await naas.getUnreadCount('user-123');                 // number
await naas.markAsRead('user-123', inboxEntryId);
await naas.markAllAsRead('user-123');                  // { updated }
await naas.deleteNotification('user-123', inboxEntryId);
```

Content fields: `title` (≤ 200), `message` (≤ 5000), `type` (`INFO` | `SUCCESS` | `WARNING` | `ERROR`, default `INFO`), `priority` (`LOW` | `NORMAL` | `HIGH`, default `NORMAL`), `metadata` (JSON object, ≤ 8 KB), and `projectKey` (optional; if given it must match the key's project). Pass either `userId` or `userIds` (≤ 1000), never both.

A send resolves to `{ id, status: 'CREATED', target, recipientCount, createdAt }` once the notification is stored.

## Browser: `NotificationInbox`

```ts
import { NotificationInbox } from 'notification-service-sdk/browser';

const inbox = new NotificationInbox({
  baseUrl: 'http://localhost:3000',
  // a string, or a function returning a fresh token (recommended: enables automatic refresh)
  token: () => fetch('/api/notification-token', { method: 'POST' }).then((r) => r.json()).then((r) => r.token),
});

const { data, meta } = await inbox.list({ page: 1, limit: 20, unread: true });
const unread = await inbox.unreadCount();
await inbox.markAsRead(data[0].id);
await inbox.markAllAsRead();
await inbox.delete(data[0].id);

const unsubscribe = inbox.subscribe({
  onConnected: ({ userId, unreadCount }) => {},
  onNotification: (notification) => {},         // acknowledged automatically → DELIVERED
  onInboxUpdated: ({ action, ids, unreadCount }) => {},   // created | read | read_all | deleted
  onDisconnected: (reason) => {},
  onError: (error) => {},
});
unsubscribe();
```

- When `token` is a function, an HTTP 401 triggers one retry with a fresh token, and a rejected socket reconnects with a fresh token after a backoff.
- `NotificationInbox` throws if it is given an `nsk_` key. `NotificationClient` logs a warning when it runs in a browser.
- Always load the inbox with `list()` when the page starts. Notifications that arrived while the user was offline are only available there.

## Errors

Failed requests reject with `NotificationServiceError`, which has `status` (HTTP status) and `body` (`{ statusCode, error, message, path, timestamp }` or `null`).

## Development

```bash
npm run build              # tsc → dist/
npm test                   # unit tests (mocked fetch)
NAAS_BASE_URL=http://localhost:3000 npm run test:integration   # against a running backend
```

## License

MIT
