# Integration guide

This guide shows how to add in-app notifications to an existing application that has its own backend and its own logged-in users. The dashboard shows the same steps with your project's key filled in, under **Project → Integration**.

The examples use `http://localhost:3000` as the NaaS base URL. Replace it with your deployment's URL.

## Overview

1. Create a project and an API key in the dashboard.
2. Your **backend** sends notifications with the secret API key.
3. Your backend issues a short-lived **user token** for each logged-in user.
4. Your **frontend** uses that token to load the inbox and receive notifications in real time.

The secret key never leaves your server. The browser only ever holds a user token, which is limited to that user's own inbox.

## 1. Create a project and an API key

1. Open the dashboard, register and sign in.
2. **Projects → New project.** The project's slug is its public **project key** (for example `acme-shop`).
3. **API keys → Generate key.** Copy the `nsk_...` value straight away, because it is shown only once. Store it in your backend's environment, for example `NAAS_API_KEY`.
4. If a key leaks, revoke it on the same page. Revocation takes effect immediately, and requests made with that key get `401`.

## 2. Install the SDK in your backend

```bash
npm install notification-service-sdk
# from this repository instead: npm install <path-to-repo>/sdk/javascript
```

The SDK is ESM, needs Node 18+ (it uses the global `fetch`), and ships TypeScript types.

## 3. Send notifications

```ts
import { NotificationClient } from 'notification-service-sdk';

const naas = new NotificationClient({
  apiKey: process.env.NAAS_API_KEY!,
  baseUrl: 'http://localhost:3000',
});

// One user. userId is YOUR application's user id (1-191 chars: letters, digits, . _ : @ | -)
await naas.send({
  projectKey: 'acme-shop',      // optional; if given it must match the key's project (else 403)
  userId: 'user-123',
  title: 'Payment Successful',
  message: 'Your payment was processed successfully.',
  type: 'SUCCESS',              // INFO (default) | SUCCESS | WARNING | ERROR
  priority: 'NORMAL',           // LOW | NORMAL (default) | HIGH
  metadata: { orderId: 42, url: '/orders/42' },   // any JSON object, max 8 KB
});

// Several users (max 1000 per request); duplicates are removed
await naas.send({ userIds: ['u1', 'u2', 'u3'], title: 'Team update', message: 'Sprint review at 15:00' });

// Every user the project knows (users who received a notification or got a user token)
await naas.broadcast({ title: 'Maintenance tonight', message: '22:00-23:00 UTC', type: 'WARNING' });
```

Every send returns `{ id, status: 'CREATED', target, recipientCount, createdAt }` as soon as the notification is stored. Real-time delivery happens afterwards, so the call never waits for browsers.

Errors throw `NotificationServiceError`, which carries `status` (the HTTP status) and `body` (`{ statusCode, error, message, path, timestamp }`).

### Without the SDK

```bash
curl -X POST http://localhost:3000/api/v1/notifications \
  -H "x-api-key: $NAAS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-123","title":"New Task Assigned","message":"You have been assigned a new task.","type":"INFO"}'
```

`Authorization: Bearer nsk_...` works as well. Unknown fields are rejected with `400`.

## 4. Issue user tokens for your logged-in users

Add an endpoint to your backend, behind your existing authentication, that returns a token for the current user:

```ts
// Express example
app.post('/api/notification-token', requireLogin, async (req, res) => {
  const { token, expiresAt } = await naas.createUserToken(req.user.id, 3600); // 60 s - 24 h
  res.json({ token, expiresAt });
});
```

The token works for that single user in this project. It can list, read and delete that user's notifications and open the real-time connection. It **cannot** send notifications and is not accepted by any server-to-server or dashboard endpoint.

## 5. Show the inbox in the browser

```ts
import { NotificationInbox } from 'notification-service-sdk/browser';

const inbox = new NotificationInbox({
  baseUrl: 'http://localhost:3000',
  // A function is called whenever a fresh token is needed (first use, 401, expired socket auth)
  token: () => fetch('/api/notification-token', { method: 'POST' })
    .then((r) => r.json())
    .then((r) => r.token),
});

// Initial load from REST (also covers everything that arrived while the user was offline)
const { data, meta } = await inbox.list({ page: 1, limit: 20 });   // optional: unread, type
const unread = await inbox.unreadCount();

// Real-time updates
const unsubscribe = inbox.subscribe({
  onConnected: () => setStatus('live'),
  onDisconnected: () => setStatus('offline'),
  onNotification: (n) => prependToList(n),             // ack is sent automatically
  onInboxUpdated: (u) => setBadge(u.unreadCount),      // created | read | read_all | deleted
  onError: (e) => console.warn(e),
});

await inbox.markAsRead(data[0].id);   // id = the inbox entry id
await inbox.markAllAsRead();
await inbox.delete(data[0].id);

// on logout / unmount
unsubscribe();
```

`NotificationInbox` refuses to start with an `nsk_` key, so a secret key cannot end up in the browser by accident.

A complete React example lives in `sdk/examples/react-demo`: login, inbox, unread badge, live/offline indicator, and mark read / mark all read.

### Without the SDK

- REST: `GET /api/v1/client/notifications`, `GET .../unread-count`, `PATCH .../read-all`, `PATCH .../:id/read`, `DELETE .../:id`, each with `Authorization: Bearer <user token>`.
- Socket.IO: `io('http://localhost:3000/notifications', { auth: { token } })`. Listen for `ready`, `notification` (call the ack callback), `inbox_updated` and `auth_error`.

## 6. Managing inboxes from your backend (optional)

With the API key, your backend can work with any user's inbox in the project:

```ts
await naas.listNotifications('user-123', { unread: true, limit: 50 });
await naas.getUnreadCount('user-123');
await naas.markAsRead('user-123', inboxEntryId);
await naas.markAllAsRead('user-123');
await naas.deleteNotification('user-123', inboxEntryId);
```

These calls also push `inbox_updated` to the user's open tabs. Reading through the server API does **not** mark entries as `DELIVERED`, because only the recipient's own client does that.

## 7. Checklist

- [ ] The API key lives only in server-side environment variables.
- [ ] The token endpoint sits behind your own authentication and uses the **current** user's id.
- [ ] Your frontend's origin is listed in the NaaS `CORS_ORIGINS`.
- [ ] The frontend loads the inbox from REST on start and does not rely only on real-time events.
- [ ] Use the dashboard's **Send test** page and **Notifications** history to confirm that recipients reach `DELIVERED` and `READ`.

## Delivery states

| Status | Meaning |
|---|---|
| `STORED` | Persisted. The recipient's client has not received it yet (offline, or no ack). |
| `DELIVERED` | A client of the recipient acknowledged the real-time event or fetched it through the client inbox API. |
| `READ` | Marked as read by the user (or by your backend on the user's behalf). |
