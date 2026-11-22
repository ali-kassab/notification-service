# Session Handoff — Notification as a Service (NaaS)

_Last updated: 2026-11-23 (end of session 1)_

## 1. Status at a glance

| Area | State |
|---|---|
| Backend (`backend/`, NestJS 11 + Prisma 6 + PostgreSQL + Socket.IO) | **Implemented**, builds, all tests passed on 2026-11-22 |
| SDK (`sdk/javascript/`) | **Implemented**, builds, unit + live integration tests passed |
| React integration demo (`sdk/examples/react-demo/`) | **Implemented**, builds, manually verified in a browser |
| Dashboard (`frontend/dashboard/`, React 19 + Vite 7 + React Router 7) | **Implemented**, builds; register / project / API key flows manually verified |
| `README.md`, `docs/architecture.md`, `docs/integration-guide.md` | **Not written yet** |
| `docs/handoff/PROJECT_HANDOFF.md`, `docs/handoff/CHANGELOG.md` | **Not written yet** |
| Git | Repository on branch `main`; 6 logical commits (initial publish) + this handoff update. Working tree clean after push. |
| GitHub `ali-kassab/notification-service` | **Published, PUBLIC**, default branch `main`, remote HEAD verified equal to local `main` (2026-11-23). |

No partial/half-edited code: every component compiles and its last full test run was green.

## 2. What was built (session 1)

### Backend — `backend/`
- `prisma/schema.prisma` + migration `prisma/migrations/*_init`. Models: `User` (dashboard account), `Project` (unique `slug` = public projectKey), `ApiKey` (SHA-256 `keyHash`, `prefix`, `revokedAt`, `lastUsedAt`), `EndUser` (projectId + externalId; broadcast audience), `Notification` (content stored once; `target` USER/USERS/BROADCAST; `recipientCount`), `NotificationRecipient` (one inbox entry per recipient; `status` STORED/DELIVERED/READ, `deliveredAt`, `readAt`; denormalised `projectId`; indexes on (projectId, recipientId, createdAt) and (projectId, recipientId, readAt)).
- Modules (`src/`): `auth/` (register/login/me, bcryptjs, dashboard JWT; `UserTokenService` + `POST /user-tokens`; `JwtAuthGuard`, `EndUserGuard`), `users/`, `projects/` (CRUD, `StatsService`), `api-keys/` (create/list/revoke, `ApiKeyGuard`), `notifications/` (service + 4 controllers), `notification-delivery/` (emit with ack → DELIVERED; `inbox_updated` sync), `gateways/` (Socket.IO namespace `/notifications`), `common/` (Prisma, exception filter, pagination, `configureApp`).
- Global: prefix `/api/v1`, `ValidationPipe` (whitelist + forbidNonWhitelisted + transform), consistent error body `{statusCode,error,message,path,timestamp}`, CORS from `CORS_ORIGINS` (REST and Socket.IO), `@nestjs/throttler` global + stricter `/auth/*` limit, env validation (requires `DATABASE_URL`, `JWT_SECRET`, `USER_TOKEN_SECRET`, secrets must differ).

#### API surface (all under `/api/v1`)
- Dashboard (JWT): `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `GET|POST /projects`, `GET|PATCH|DELETE /projects/:projectId`, `GET /projects/:projectId/stats`, `GET /stats/overview`, `GET|POST /projects/:projectId/api-keys`, `DELETE /projects/:projectId/api-keys/:keyId` (revoke), `GET|POST /projects/:projectId/notifications`, `GET|DELETE /projects/:projectId/notifications/:notificationId`.
- External, secret API key (`x-api-key: nsk_...` or `Authorization: Bearer nsk_...`): `POST /notifications` (`userId` xor `userIds`, optional `projectKey` must match → else 403; returns `{id,status:"CREATED",target,recipientCount,createdAt}`), `POST /notifications/broadcast`, `POST /user-tokens`, `GET /users/:userId/notifications` (`page`,`limit`≤100,`unread`,`type`), `GET .../unread-count`, `PATCH .../read-all`, `PATCH .../:id/read`, `DELETE .../:id`.
- Browser, user token (`Authorization: Bearer <user token>`): `GET /client/notifications` (marks returned STORED entries DELIVERED), `GET /client/notifications/unread-count`, `PATCH /client/notifications/read-all`, `PATCH /client/notifications/:id/read`, `DELETE /client/notifications/:id`. No send endpoints.
- WebSocket: `io(baseUrl + "/notifications", { auth: { token } })`. Server events: `ready {userId, unreadCount}`, `notification` (InboxItem, expects ack), `inbox_updated {action, ids, unreadCount}`, `auth_error`. Server decides the room `project:<projectId>:user:<userId>`; clients cannot join rooms.
- `GET /health`.

### SDK — `sdk/javascript/` (package `notification-service-sdk`, ESM, built with plain `tsc`)
- `NotificationClient` (server, secret key): `send`, `broadcast`, `createUserToken`, `listNotifications`, `getUnreadCount`, `markAsRead`, `markAllAsRead`, `deleteNotification`. Warns if constructed in a browser.
- `NotificationInbox` (browser, `notification-service-sdk/browser`): `list`, `unreadCount`, `markAsRead`, `markAllAsRead`, `delete`, `subscribe({onNotification,onInboxUpdated,onConnected,onDisconnected,onError})` (auto-ack, token refresh on 401 / auth_error with backoff). Refuses `nsk_` keys.
- `NotificationServiceError` with `status` and `body`.

### Demo — `sdk/examples/react-demo/`
- `server/demo-server.mjs`: stand-in "app backend" holding `NAAS_API_KEY`; `/api/login`, `/api/token`, `/api/place-order` (sends via SDK). Demo-only auth via `x-demo-user` header — intentionally not real auth.
- React app: login, inbox, unread badge, live/offline indicator, real-time arrivals, mark read / mark all read, reload-safe (inbox loaded from REST).

### Dashboard — `frontend/dashboard/`
Pages: Login, Register, Overview (stats + type breakdown + recent), Projects (list/create), Project details (stats, edit, delete), API keys (create shown once, revoke), Notification history (type/priority/target/recipient filters in URL, pagination), Notification details (recipients with status filter + pagination, delete), Send test (one / several / broadcast, metadata JSON), Integration instructions (project-specific snippets). API base URL `VITE_API_URL` (default `http://localhost:3000`).

### Other root files
`docker-compose.yml` (postgres:17-alpine, container `naas-postgres`, host port **5435**, volume `naas-pgdata`), `docker/postgres-init.sql` (creates `naas_test`), `.gitignore` (ignores `node_modules`, `dist`, `.env`, `.env.*` except `.env.example`, `*.tsbuildinfo`), `.claude/launch.json` (dev-server previews for dashboard and demo).

## 3. Important technical decisions
1. **NestJS 11 / Prisma 6 / TypeScript 5.9 / Jest 29 / Vite 7** chosen over newer majors (Nest 12, Prisma 7, TS 7, Vite 8) for known-stable APIs.
2. **Content stored once** (`Notification`) + **per-recipient inbox rows** (`NotificationRecipient`) → no duplicated title/message for multi-user/broadcast sends, independent read state per user.
3. **Broadcast audience = `EndUser` table** (users who received a notification or got a user token). Users never seen before are not reached.
4. **Persist first, then deliver.** Delivery is fire-and-forget after the DB transaction commits; HTTP response does not wait.
5. **DELIVERED is only set on a client ack** (Socket.IO ack within 5 s) **or when the recipient's own client fetches the inbox via `/client/notifications`**. Emitting is never treated as delivery.
6. **Browser credentials are user tokens** (JWT, separate secret `USER_TOKEN_SECRET`, audience `naas-end-user`, 60 s–24 h TTL) issued by the integrator's backend. Dashboard JWT uses `JWT_SECRET`, audience `naas-dashboard`. Neither is accepted in place of the other (tested).
7. **API keys**: `nsk_` + 32 random bytes base64url; only SHA-256 hash stored (fine for high-entropy keys); shown once.
8. Other projects' / users' resources return **404** (not 403) to avoid leaking existence.
9. bcryptjs (pure JS) instead of native bcrypt to avoid native builds on Node 26.
10. SDK built with `tsc` only (no bundler), ESM output, `socket.io-client` as its only runtime dependency.

## 4. Verification results (actually executed)

### Session 1 run (2026-11-22, Docker/PostgreSQL running)
- Backend `nest build`: success.
- Backend unit tests (`npx jest`): **2 suites, 5 tests passed**.
- Backend e2e (`npm run test:e2e`, real PostgreSQL `naas_test`, real HTTP + Socket.IO): **4 suites, 54 tests passed** — auth, project isolation, API key auth & revocation, single/multi/broadcast sends, validation, pagination, read/unread, delete, client token scoping, expired tokens, admin history/details/stats, WebSocket auth rejection, room isolation (other user, same user id in other project), multi-tab delivery, ack → DELIVERED, no ack → stays STORED, offline persistence + reconnect, `inbox_updated`.
- SDK unit tests (`npm test`, node:test, mocked fetch): **5 passed**.
- SDK integration (`NAAS_BASE_URL=http://localhost:3000 npm run test:integration` against a running backend): **3 passed** (send/list/count/read/delete/broadcast; real-time subscribe + ack + offline persistence; revoked key → 401).
- Dashboard `npm run build`: success. Demo `npm run build`: success.
- Manual browser check: dashboard register → overview → create project `acme-shop` → generate API key (shown once) worked; demo app login as `alice` → "Place an order" twice → both notifications appeared live, unread badge 2, status "live".
- Not manually clicked through yet: dashboard Send test, Notifications history, Notification details, Integration pages (they compile and call endpoints covered by e2e tests).

### Shutdown re-check (2026-11-23)
- Backend build: **success**. Backend unit: **5/5 passed**. SDK unit: **5/5 passed**. Dashboard build: **success**. Demo build: **success**.
- Backend e2e: **54/54 failed — environmental**: Docker Desktop is not running, so `Can't reach database server at localhost:5435` (PrismaClientInitializationError). No code changed since the green run. Re-run after starting Docker.
- SDK integration: not re-run (needs backend + database).

## 5. Known issues / limitations
- `npm audit` (backend): high-severity advisories in `effect` and `deepmerge-ts` pulled in by the **Prisma 6 CLI** (`@prisma/config`), moderate in `glob`/`minimatch` via `@nestjs/cli`. Build/CLI tooling only, not the request path; fix requires Prisma 7 / Nest CLI 12 (breaking). SDK, dashboard, demo: 0 vulnerabilities.
- Single-instance real-time delivery: Socket.IO rooms are in-memory; horizontal scaling would need the Redis adapter (deliberately not added).
- No retry/redelivery of real-time events: offline/un-acked notifications stay STORED and are picked up via the REST inbox on reconnect.
- Broadcast reaches only known `EndUser`s; very large broadcasts are inserted in one transaction (no chunking).
- Deleting an inbox entry does not decrement `Notification.recipientCount` (it means "sent to").
- No dashboard live updates (dashboard refreshes on navigation), no password reset, no email verification.
- Dev ports: on this machine 5173 and 5174 were occupied by other projects, so dev servers auto-moved (dashboard 5174, demo 5175). The backend `.env` `CORS_ORIGINS` only lists 5173/5174 — add the actual dev origins if ports shift.
- Local dev database contains manual-test data (user `demo-admin@example.com`, project `acme-shop`, one API key, demo user `alice`). Test DB `naas_test` is truncated by each e2e suite.

## 6. Incomplete tasks (in order)
1. Write `README.md` (overview, architecture diagram, stack, features, structure, DB setup, env vars, backend/frontend/SDK setup, endpoints, auth, integration examples, WebSocket usage, testing).
2. Write `docs/architecture.md` (request lifecycle: external app → API key guard → NotificationsService transaction → PostgreSQL → NotificationDeliveryService → gateway room → client ack).
3. Write `docs/integration-guide.md` (step-by-step; can reuse `frontend/dashboard/src/pages/IntegrationPage.tsx` content).
4. Write `docs/handoff/PROJECT_HANDOFF.md` and `docs/handoff/CHANGELOG.md` (sections 2–5 of this file are the source material).
5. Optional: `sdk/javascript/README.md`; manually click through Send test / history / details pages.
6. Start Docker, re-run the full verification (section 8).
7. Commit the docs from items 1–4 and push them (ask the user before pushing).

## 7. Git / GitHub state and blocker
- On 2026-11-23 the user explicitly authorized "Push initial to main". Done: `git init -b main`, repo `https://github.com/ali-kassab/notification-service` created **public** under account **ali-kassab** (verified with `gh auth status`), remote `origin` = `https://github.com/ali-kassab/notification-service.git`, `main` pushed and tracking `origin/main`.
- Initial commits (oldest → newest): `e283fed` scaffolding + PostgreSQL, `7ac447c` backend, `21d83dd` SDK, `325fed3` React demo, `5087743` dashboard, `3655125` session handoff. Remote HEAD verified = `3655125` before this handoff update; 106 files on the remote.
- All commits verified on GitHub: Author = Committer = `ali-kassab <alikassab155@gmail.com>`; no `Co-authored-by` or AI attribution.
- Not committed (ignored): `backend/.env`, `node_modules/`, `dist/`, `*.tsbuildinfo`. A secret scan of the committed files found no API keys or tokens.
- Rules for future work: every commit must have Author = Committer = `ali-kassab <alikassab155@gmail.com>` with no AI trailers (check `git log -1 --format='%an <%ae> | %cn <%ce>'`); each push needs the user's explicit approval for that push; never force-push or merge without approval.

## 8. How to continue (exact steps)
1. Start Docker Desktop, then from the repo root:
   ```
   docker compose up -d
   ```
2. Backend (first time on a new machine: `cp .env.example .env`, then `npm install`, `npx prisma migrate deploy`; for the test DB run `DATABASE_URL="postgresql://naas:naas@localhost:5435/naas_test?schema=public" npx prisma migrate deploy`):
   ```
   cd backend && npm run build && npx jest && npm run test:e2e
   ```
   Expect 5 unit + 54 e2e tests passing.
3. SDK: `cd sdk/javascript && npm install && npm test`; then with the backend running (`cd backend && npm start`): `NAAS_BASE_URL=http://localhost:3000 npm run test:integration` (expect 3 passing).
4. Builds: `cd frontend/dashboard && npm install && npm run build`; `cd sdk/examples/react-demo && npm install && npm run build`.
5. Demo run: create a project + API key in the dashboard (`npm run dev` in `frontend/dashboard`), then `NAAS_API_KEY=nsk_... npm run server` and `npm run dev` in `sdk/examples/react-demo`.
6. **Next step for the next session:** `git pull` on `main`, start Docker and re-run the section 8 checks, then write the missing docs (section 6, items 1–4), commit them with the verified identity, and ask the user before pushing.
