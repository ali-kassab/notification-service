# Architecture

This document explains how a notification travels from an integrating application to a user's browser, and the design decisions behind that path.

## Components

| Component | Location | Role |
|---|---|---|
| REST API | `backend/src/*/…controller.ts` | Dashboard, server-to-server and browser endpoints under `/api/v1` |
| `ApiKeyGuard` | `backend/src/api-keys/api-key.guard.ts` | Resolves a secret key (`nsk_…`) to its project |
| `JwtAuthGuard` / `EndUserGuard` | `backend/src/auth/guards.ts` | Verify dashboard JWTs and end-user tokens |
| `NotificationsService` | `backend/src/notifications/notifications.service.ts` | Persistence: send, broadcast, inbox, admin history |
| `NotificationDeliveryService` | `backend/src/notification-delivery/notification-delivery.service.ts` | Real-time delivery of already-persisted notifications |
| `NotificationsGateway` | `backend/src/gateways/notifications.gateway.ts` | Socket.IO namespace `/notifications`, one room per (project, user) |
| PostgreSQL via Prisma | `backend/prisma/schema.prisma` | Source of truth for all state |
| SDK | `sdk/javascript` | `NotificationClient` (server) and `NotificationInbox` (browser) |
| Dashboard | `frontend/dashboard` | Admin UI for dashboard users |

## Data model

```
User ──< Project ──< ApiKey            (keyHash = SHA-256, prefix, revokedAt, lastUsedAt)
            │
            ├──< EndUser               (projectId + externalId; broadcast audience)
            │
            └──< Notification          (title, message, type, priority, metadata, target, recipientCount)
                     │
                     └──< NotificationRecipient   (one inbox entry per recipient:
                                                   status STORED → DELIVERED → READ,
                                                   deliveredAt, readAt, denormalised projectId)
```

- The content is stored **once** in `Notification`. Every recipient has their own `NotificationRecipient` row, so a 1000-user send does not duplicate the title and message, and each user's read state is independent.
- Inbox queries use the indexes `(projectId, recipientId, createdAt)` and `(projectId, recipientId, readAt)`.
- `Project.slug` is the public `projectKey`. It is not a secret.

## Send lifecycle

```
External app backend
   │  POST /api/v1/notifications   x-api-key: nsk_…
   ▼
ApiKeyGuard ── hash key → ApiKey row → reject if missing/revoked (401)
   │           attach { projectId, slug } to the request; update lastUsedAt (best effort)
   ▼
ValidationPipe ── whitelist + forbidNonWhitelisted; userId xor userIds; metadata ≤ 8 KB
   │              projectKey (if given) must equal the key's project slug (403)
   ▼
NotificationsService.create()   ── one PostgreSQL transaction ──
   │   1. upsert EndUser rows for the recipients (skipDuplicates)
   │   2. insert Notification (content once)
   │   3. insert NotificationRecipient rows (status STORED)
   │  COMMIT
   │
   ├──▶ HTTP 201 { id, status: "CREATED", target, recipientCount, createdAt }
   │    (the response does not wait for real-time delivery)
   │
   ▼  fire-and-forget, after the commit
NotificationDeliveryService.deliver(items)
   │  for each inbox entry:
   │   - recipient has no connected socket → nothing is emitted, the entry stays STORED
   │   - otherwise emit "notification" to room project:<projectId>:user:<userId>
   │     with an acknowledgement (5 s timeout)
   ▼
Browser (NotificationInbox / socket.io-client) ── ack() ──▶ entry STORED → DELIVERED
   │
   └─ "inbox_updated" { action: "created", ids, unreadCount } to every tab of that user
```

A broadcast follows the same path. The recipient list is every `EndUser` of the project.

### Why persist first

The transaction commits before anything is emitted, so no client can see a notification that is not stored, and a failure in real-time delivery can never lose a notification. A user who is offline, or whose client did not acknowledge in time, finds the entry still `STORED` and receives it the next time the inbox is fetched.

### What "DELIVERED" means

An entry becomes `DELIVERED` only when one of the recipient's own clients actually received it, in one of two ways:

1. a Socket.IO acknowledgement for the `notification` event, or
2. the recipient's client fetching its inbox through `GET /client/notifications`, which marks the returned `STORED` entries as delivered.

Emitting an event is never counted as delivery. Reads by the integrator's backend (`GET /users/:userId/notifications` with an API key) do not change the status either.

## Real-time connection lifecycle

```
Browser                                      NotificationsGateway
  │ io(baseUrl + "/notifications",              │
  │    { auth: { token: <user token> } })  ───▶ │ verify token (USER_TOKEN_SECRET, aud naas-end-user)
  │                                             │ check the project still exists
  │                                             │   fail → emit auth_error, disconnect
  │                                             │ join room project:<projectId>:user:<userId>
  │ ◀── ready { userId, unreadCount } ───────── │
  │ ◀── notification (InboxItem, needs ack) ─── │
  │ ◀── inbox_updated { action, ids, unreadCount } (created | read | read_all | deleted)
```

- **The room comes from the verified token only.** There is no "join" message, so a client cannot subscribe to another user's or another project's events. The project id is a fixed-length UUID, which keeps room names unambiguous: the same `userId` in two projects lands in two different rooms.
- Several tabs or devices of one user share the room. Each one receives the events, and one ack is enough to mark the entry delivered.
- Read, read-all and delete actions, whether they come through the browser API or the server API, trigger `inbox_updated`, so unread badges stay in sync across tabs.
- The SDK acknowledges automatically. When it gets `auth_error` or an HTTP 401, it requests a fresh token from the integrator's token callback and reconnects with backoff.

## Credentials and isolation

| Credential | Secret | Audience | Scope |
|---|---|---|---|
| Dashboard JWT | `JWT_SECRET` | `naas-dashboard` | The dashboard user's own projects |
| API key `nsk_` + 32 random bytes (base64url) | stored as SHA-256 hash | n/a | One project, server-to-server |
| User token (60 s – 24 h) | `USER_TOKEN_SECRET` | `naas-end-user` | One user's inbox in one project, no sending |

- The environment check refuses to start when `JWT_SECRET` and `USER_TOKEN_SECRET` are equal. The audiences differ too, so neither token type is accepted in place of the other.
- Every query is scoped by the `projectId` taken from the credential, never from the request body.
- Requests for other projects' or users' resources return **404**, not 403, so the response does not reveal that a resource exists.
- A plain SHA-256 hash is enough for API keys because they are high-entropy random values. Dashboard passwords use bcryptjs.

## Cross-cutting concerns

- **Validation:** a global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted` and `transform`. User ids must match `^[A-Za-z0-9._:@|-]{1,191}$`.
- **Errors:** a global exception filter returns `{ statusCode, error, message, path, timestamp }`.
- **Rate limiting:** a global `@nestjs/throttler` limit, plus a stricter per-IP limit on `/auth/register` and `/auth/login`.
- **CORS:** the `CORS_ORIGINS` allow-list applies to both REST and Socket.IO.
- **Pagination:** `page` and `limit` (1–100, default 20). Responses look like `{ data, meta: { page, limit, total, totalPages } }`.

## Limitations and scaling notes

- Socket.IO rooms live in memory on one instance. Running several instances would need a shared adapter such as Redis so that emits reach sockets on other nodes. This was deliberately left out.
- Un-acked real-time events are not retried. The REST inbox is the recovery path.
- A broadcast inserts every recipient row in one transaction, without chunking. Very large audiences would need batching.
- Deleting an inbox entry does not decrement `Notification.recipientCount`, which records how many recipients the notification was sent to.
