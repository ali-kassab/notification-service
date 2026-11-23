# Notification as a Service (NaaS)

A self-hostable notification platform. Your backend sends notifications to your users through a REST API (or the TypeScript SDK). NaaS stores every notification in PostgreSQL and pushes it to the user's open browser tabs in real time over Socket.IO. Users who are offline see their notifications when they come back. A dashboard lets you manage projects and API keys, send test notifications and look at delivery history.

```
 Your backend ──(secret API key)──▶  NaaS REST API  ──▶ PostgreSQL
      │                                    │
      │ issues short-lived user token      │ after commit: emit to room
      ▼                                    ▼  project:<id>:user:<userId>
 Your users' browser ──(user token)──▶ Socket.IO /notifications  ──ack──▶ DELIVERED
                     ──(user token)──▶ REST /client/notifications (inbox, read, delete)

 Dashboard (React) ──(dashboard JWT)──▶ projects, API keys, history, stats, test sends
```

See [docs/architecture.md](docs/architecture.md) for the full request lifecycle and [docs/integration-guide.md](docs/integration-guide.md) for a step-by-step integration.

## Features

- **Projects and API keys.** Every project has its own users, notifications and secret keys (`nsk_...`). Keys are shown once and stored only as a SHA-256 hash. You can revoke them.
- **Send to one user, several users (up to 1000) or broadcast** to every known user of a project. The content is stored once, and each recipient gets their own inbox entry with its own read state.
- **Real-time delivery** over Socket.IO, with one server-assigned room per (project, user) and multi-tab support. An entry becomes `DELIVERED` only when a client acknowledges it, never just because it was emitted.
- **Offline persistence.** Notifications are persisted before delivery, and the REST inbox returns everything on reconnect.
- **Inbox API.** Pagination, unread/read filters, type filter, unread count, mark one or all as read, and delete. `inbox_updated` events keep every open tab in sync.
- **Scoped browser credentials.** Your backend issues a user token (60 s – 24 h) that only grants access to that one user's inbox. It cannot send notifications.
- **Dashboard.** Overview stats, projects, API keys, notification history with filters, per-recipient delivery status, a send-test form and project-specific integration snippets.
- **Hardening.** Global validation (unknown fields are rejected), a consistent error body, CORS allow-list, rate limiting (stricter on `/auth/*`), environment validation, and 404 (rather than 403) for other projects' resources.

## Stack

| Part | Technology |
|---|---|
| Backend | Node.js, NestJS 11, Prisma 6, PostgreSQL 17, Socket.IO 4, `@nestjs/jwt`, `@nestjs/throttler`, bcryptjs, class-validator |
| SDK | TypeScript 5.9, ESM, built with `tsc`; only runtime dependency is `socket.io-client` |
| Dashboard | React 19, Vite 7, React Router 7 |
| Demo | React + Vite app with a small Node "app backend" (`sdk/examples/react-demo`) |
| Tests | Jest 29 + Supertest (backend unit/e2e against real PostgreSQL), `node:test` (SDK) |

## Repository structure

```
backend/                 NestJS API + Socket.IO gateway
  prisma/                schema.prisma and migrations
  src/auth/              dashboard register/login (JWT), user tokens, guards
  src/projects/          project CRUD and stats
  src/api-keys/          API key create/list/revoke and ApiKeyGuard
  src/notifications/     send, inbox and admin controllers + NotificationsService
  src/notification-delivery/  real-time delivery after persistence, ack → DELIVERED
  src/gateways/          Socket.IO namespace /notifications
  src/common/            Prisma, error filter, pagination, app setup
  test/                  e2e suites (auth, projects/API keys, notifications, realtime)
sdk/javascript/          notification-service-sdk (NotificationClient, NotificationInbox)
sdk/examples/react-demo/ demo app + demo backend using the SDK
frontend/dashboard/      admin dashboard
docker-compose.yml, docker/  older containerised PostgreSQL setup (not used; see Getting started)
docs/                    architecture, integration guide, handoff notes
```

## Getting started

Prerequisites: Node.js 18+ (developed on Node 26), npm, and a locally installed PostgreSQL 16 or 17. Docker is not used.

### 1. Database

**Option A: a private instance on port 5435 (matches the committed defaults, no superuser password needed).** Use the binaries of an installed PostgreSQL (Windows paths shown; use any data directory outside the repo):

```bash
PG="/c/Program Files/PostgreSQL/17/bin"
echo naas > pw.txt && "$PG/initdb" -D ../naas-pgdata -U naas --pwfile=pw.txt -A scram-sha-256 -E UTF8 --locale=C && rm pw.txt
"$PG/pg_ctl" -D ../naas-pgdata -l ../naas-pgdata/server.log -o "-p 5435 -c listen_addresses=localhost" start
PGPASSWORD=naas "$PG/psql" -h localhost -p 5435 -U naas -d postgres -c "CREATE DATABASE naas" -c "CREATE DATABASE naas_test"
# later: "$PG/pg_ctl" -D ../naas-pgdata stop   /   start again with the pg_ctl start line above
```

**Option B: an existing server.** Create the role and both databases once, as the PostgreSQL superuser. Use the port of your local server (5432 by default):

```bash
psql -h localhost -p 5432 -U postgres \
  -c "CREATE ROLE naas LOGIN PASSWORD 'naas'" \
  -c "CREATE DATABASE naas OWNER naas" \
  -c "CREATE DATABASE naas_test OWNER naas"
```

`naas` is the development database and `naas_test` is used by the e2e tests. With option B, point `DATABASE_URL` in `backend/.env` at your server, for example `postgresql://naas:naas@localhost:5432/naas?schema=public`. The committed defaults (`.env.example`, e2e setup) use `localhost:5435`, which is option A.

### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npx prisma migrate deploy
npm run build && npm start    # http://localhost:3000/api/v1  (or npm run start:dev)
```

Environment variables (`backend/.env`):

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_SECRET` | yes | Signs dashboard JWTs |
| `USER_TOKEN_SECRET` | yes | Signs end-user (browser) tokens. Must be different from `JWT_SECRET` |
| `PORT` | no | HTTP port, default `3000` |
| `JWT_EXPIRES_IN` | no | Dashboard session lifetime, default `1d` |
| `USER_TOKEN_DEFAULT_TTL_SECONDS` | no | Default user token lifetime, default `3600` |
| `CORS_ORIGINS` | no | Comma-separated allowed browser origins (REST and Socket.IO) |
| `RATE_LIMIT_TTL_MS`, `RATE_LIMIT_MAX` | no | Global rate limit window and max requests |
| `AUTH_RATE_LIMIT_MAX` | no | Per-minute limit for `/auth/register` and `/auth/login` |

Use long random values for both secrets in production. Add every dashboard and client-app origin to `CORS_ORIGINS`.

### 3. Dashboard

```bash
cd frontend/dashboard
npm install
npm run dev                   # VITE_API_URL defaults to http://localhost:3000
```

Register an account, create a project and generate an API key. The key is shown only once.

### 4. SDK and demo

```bash
cd sdk/javascript && npm install && npm run build
cd ../examples/react-demo && npm install
NAAS_API_KEY=nsk_... npm run server   # demo "app backend"
npm run dev                           # demo React app
```

## API overview

Every route is under `/api/v1`. Errors always have the shape `{ statusCode, error, message, path, timestamp }`.

### Dashboard (Authorization: `Bearer <dashboard JWT>`)

| Method | Path |
|---|---|
| POST | `/auth/register`, `/auth/login` |
| GET | `/auth/me` |
| GET, POST | `/projects` |
| GET, PATCH, DELETE | `/projects/:projectId` |
| GET | `/projects/:projectId/stats`, `/stats/overview` |
| GET, POST | `/projects/:projectId/api-keys` |
| DELETE | `/projects/:projectId/api-keys/:keyId` (revoke) |
| GET, POST | `/projects/:projectId/notifications` (history / send test) |
| GET, DELETE | `/projects/:projectId/notifications/:notificationId` |

### Server-to-server (`x-api-key: nsk_...` or `Authorization: Bearer nsk_...`)

| Method | Path | Notes |
|---|---|---|
| POST | `/notifications` | `userId` **or** `userIds` (exactly one), `title`, `message`, optional `type` (`INFO`/`SUCCESS`/`WARNING`/`ERROR`), `priority` (`LOW`/`NORMAL`/`HIGH`), `metadata` (JSON object ≤ 8 KB), `projectKey` (must match the key's project, otherwise 403) |
| POST | `/notifications/broadcast` | Same content fields, sent to every known user of the project |
| POST | `/user-tokens` | `{ userId, expiresIn? }` → `{ token, userId, expiresAt }` |
| GET | `/users/:userId/notifications` | `page`, `limit` (≤ 100), `unread`, `type` |
| GET | `/users/:userId/notifications/unread-count` | |
| PATCH | `/users/:userId/notifications/read-all`, `/users/:userId/notifications/:id/read` | |
| DELETE | `/users/:userId/notifications/:id` | |

Sending returns `{ id, status: "CREATED", target, recipientCount, createdAt }`. User ids are 1–191 characters made of letters, digits and `. _ : @ | -`.

### Browser (`Authorization: Bearer <user token>`)

| Method | Path |
|---|---|
| GET | `/client/notifications` (returned `STORED` entries are marked `DELIVERED`), `/client/notifications/unread-count` |
| PATCH | `/client/notifications/read-all`, `/client/notifications/:id/read` |
| DELETE | `/client/notifications/:id` |

There are no send endpoints for user tokens.

### WebSocket

```js
import { io } from 'socket.io-client';
const socket = io('http://localhost:3000/notifications', { auth: { token: userToken } });
socket.on('ready', ({ userId, unreadCount }) => {});
socket.on('notification', (item, ack) => { ack(); /* InboxItem */ });
socket.on('inbox_updated', ({ action, ids, unreadCount }) => {});   // created | read | read_all | deleted
socket.on('auth_error', ({ message }) => {});
```

The server picks the room from the verified token. Clients cannot join rooms themselves. The SDK's `NotificationInbox.subscribe()` handles the ack and token refresh for you.

`GET /health` is a liveness check.

## Authentication model

| Credential | Who holds it | Can do |
|---|---|---|
| Dashboard JWT (`JWT_SECRET`, audience `naas-dashboard`) | Dashboard users | Manage own projects, keys, history, test sends |
| Secret API key `nsk_...` | Your backend only | Send, broadcast, issue user tokens, manage any inbox in the project |
| User token (`USER_TOKEN_SECRET`, audience `naas-end-user`) | One end user's browser | Read and manage **that user's** inbox, real-time stream |

None of these credentials is accepted in place of another.

## SDK example

```ts
// Server
import { NotificationClient } from 'notification-service-sdk';
const naas = new NotificationClient({ apiKey: process.env.NAAS_API_KEY!, baseUrl: 'http://localhost:3000' });
await naas.send({ userId: 'user-123', title: 'Payment Successful', message: 'Thanks!', type: 'SUCCESS' });
const { token } = await naas.createUserToken('user-123', 3600);

// Browser
import { NotificationInbox } from 'notification-service-sdk/browser';
const inbox = new NotificationInbox({ baseUrl: 'http://localhost:3000', token: () => fetchTokenFromYourBackend() });
const { data } = await inbox.list({ unread: true });
inbox.subscribe({ onNotification: (n) => show(n), onInboxUpdated: (u) => setBadge(u.unreadCount) });
```

## Testing

```bash
cd backend
export DATABASE_URL="postgresql://naas:naas@localhost:5435/naas_test?schema=public"   # option A default; adjust for option B
npx prisma migrate deploy     # once, for the test database
npx jest                      # unit tests (no database needed)
npm run test:e2e              # e2e: real PostgreSQL (naas_test), HTTP and Socket.IO
cd ../sdk/javascript
npm test                      # SDK unit tests (mocked fetch)
NAAS_BASE_URL=http://localhost:3000 npm run test:integration   # needs a running backend
```

## Known limitations

- Real-time delivery runs on a single instance. Socket.IO rooms are in memory, so scaling out would need a Socket.IO adapter such as Redis.
- There is no retry for un-acked real-time events. Those entries stay `STORED` and are fetched through the inbox API.
- A broadcast reaches only users the project already knows: users who have received a notification or been issued a user token.
- There is no password reset or email verification for dashboard accounts.

## License

MIT
