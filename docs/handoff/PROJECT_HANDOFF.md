# Project Handoff — Notification as a Service (NaaS)

Permanent project-level reference: purpose, architecture, decisions, conventions and constraints. Session-specific progress belongs in [SESSION_HANDOFF.md](SESSION_HANDOFF.md). Release history belongs in [CHANGELOG.md](CHANGELOG.md).

## 1. Purpose and scope

A self-hostable notification platform. Integrating applications send in-app notifications to their own users through a REST API or the TypeScript SDK. NaaS persists them in PostgreSQL and delivers them in real time over Socket.IO, and offline users get them later through the inbox API. A dashboard manages projects, API keys, history and test sends.

In scope: in-app notifications (single, multi-user, broadcast), inbox with read state, real-time delivery, SDK, dashboard, React demo.
Not in scope (do not add without the user asking): email/SMS/push channels, password reset, email verification, multi-instance scaling, redelivery queues, dashboard live updates.

There is no release roadmap (R-numbered releases) defined for this project. Work items are listed in SESSION_HANDOFF.md.

## 2. Repository layout

| Path | Content |
|---|---|
| `backend/` | NestJS 11 API + Socket.IO gateway, Prisma 6 schema/migrations, Jest unit (`src/**/*.spec.ts`) and e2e (`test/*.e2e-spec.ts`) tests |
| `sdk/javascript/` | `notification-service-sdk`: `NotificationClient` (server), `NotificationInbox` (`/browser`) |
| `sdk/examples/react-demo/` | React demo + `server/demo-server.mjs` stand-in app backend (demo-only auth) |
| `frontend/dashboard/` | React 19 + Vite 7 + React Router 7 admin dashboard |
| `docs/` | `architecture.md`, `integration-guide.md`, `handoff/` |
| `docker-compose.yml`, `docker/` | Older containerised PostgreSQL setup. **Not used** (see §6) |

## 3. Architecture (summary; details in `docs/architecture.md`)

- **Data model:** `User` → `Project` (unique `slug` = public projectKey) → `ApiKey` (SHA-256 `keyHash`), `EndUser` (broadcast audience), `Notification` (content stored once) → `NotificationRecipient` (one inbox row per recipient, status `STORED → DELIVERED → READ`).
- **Persist first, then deliver:** the send transaction commits before any emit, delivery is fire-and-forget, and the HTTP response does not wait for it.
- **DELIVERED** only on a client Socket.IO ack (5 s timeout) or when the recipient's own client fetches `/client/notifications`. An emit alone never counts.
- **Rooms:** `project:<projectId>:user:<userId>`, assigned by the server from the verified user token. Clients cannot join rooms.
- **Credentials:** dashboard JWT (`JWT_SECRET`, aud `naas-dashboard`); secret API key `nsk_` + 32 random bytes, stored as SHA-256 and shown once; user token (`USER_TOKEN_SECRET`, aud `naas-end-user`, 60 s–24 h, cannot send). Neither JWT type is accepted in place of the other, and the secrets must differ (checked at startup).
- **Isolation:** every query is scoped by the credential's project, and other projects' or users' resources return 404.
- **API:** global prefix `/api/v1`, `ValidationPipe` (whitelist + forbidNonWhitelisted + transform), error body `{statusCode,error,message,path,timestamp}`, CORS allow-list `CORS_ORIGINS` (REST + Socket.IO), `@nestjs/throttler` global + stricter `/auth/*`.

## 4. Permanent technical decisions

1. Versions pinned to stable majors: NestJS 11, Prisma 6, TypeScript ~5.9, Jest 29, Vite 7, React 19, Socket.IO 4. Do not upgrade majors (Nest 12, Prisma 7, TS 7, Vite 8) without the user asking.
2. bcryptjs (pure JS), not native bcrypt.
3. The SDK is built with plain `tsc` (ESM, no bundler). Its only runtime dependency is `socket.io-client`.
4. Content is stored once, with per-recipient inbox rows.
5. The broadcast audience is the `EndUser` table: users who received a notification or got a user token.
6. Real-time delivery runs on a single instance (in-memory rooms). The Redis adapter is deliberately not added.

## 5. Conventions

- NestJS modules per domain (`auth`, `projects`, `api-keys`, `notifications`, `notification-delivery`, `gateways`, `common`). Controllers are split by credential type: admin (JWT), external (API key), client (user token).
- DTOs use class-validator. User ids match `^[A-Za-z0-9._:@|-]{1,191}$`. Pagination is `page`/`limit` (≤ 100), returning `{data, meta:{page,limit,total,totalPages}}`.
- Schema changes go through Prisma migrations in `backend/prisma/migrations`.
- Commit messages: short imperative English sentence, capitalised, no prefix (e.g. "Add TypeScript SDK with server client and browser inbox client").

## 6. Constraints that must not be changed or overlooked

### Environment
- **Never use Docker in this project**: no `docker`/`docker compose` commands and no starting Docker Desktop (the user's instruction, 2026-11-23). Use a natively installed PostgreSQL. This machine runs PostgreSQL 17 on port 5432 and 16 on port 5433 as Windows services. If the required role or databases are missing, report the database-dependent checks as blocked.
- The committed defaults (`backend/.env.example`, `backend/test/setup-env.ts`) still point at port 5435. Override them with `DATABASE_URL`, because environment values win.

### Git and GitHub
- Identity: Author = Committer = `ali-kassab <alikassab155@gmail.com>`. Check `git config user.name/user.email` and that no `GIT_AUTHOR_*`/`GIT_COMMITTER_*` overrides are set before committing. Verify afterwards with `git log -1 --format='%an <%ae> | %cn <%ce>'`.
- No `Co-Authored-By`, "Generated with …" or any AI attribution in commits or PRs.
- Remote: `origin` = `https://github.com/ali-kassab/notification-service.git` (public), account `ali-kassab`. Run `gh auth status` and `git remote -v` before any push.
- Do not commit to or modify `main` directly. Work on a feature branch. **No authorized push branch has been designated yet.** Pushing needs a branch the user has authorized.
- Never force-push, rewrite history (`--amend`, rebase, `reset --hard`), run `git clean`, delete branches or tags, merge, create PRs or enable auto-merge without the user's explicit approval.
- Never commit `backend/.env`, `node_modules/`, `dist/` or `*.tsbuildinfo` (they are ignored), or any secret.

### Security
- Secret API keys stay server-side. The SDK warns when `NotificationClient` runs in a browser, and `NotificationInbox` refuses `nsk_` keys.
- User tokens must never gain send rights.

## 7. Working policies

### Installed Skills
- Before working on a task, find the installed Skills that apply (for example `webapp-testing` or the built-in browser skill for UI verification, `vercel-react-best-practices` for React code, `spring-*`/`flyway-*` do **not** apply to this Node/Prisma stack). Read a Skill's instructions before using it. Never claim a Skill was used unless its instructions were actually read and followed.
- Project architecture, security requirements and existing conventions take priority over generic Skill recommendations.

### Reuse-First Development
- Prefer existing project components and already-installed libraries before building anything new.
- For new components or features, evaluate mature, compatible, free/open-source libraries before writing custom solutions. Check maintenance status, licence, accessibility and bundle impact, and avoid unnecessary dependencies.
- Customise reused components to the project's design system and its Arabic RTL, English LTR and responsive requirements.
- Do not refactor or replace existing components merely to apply this policy.

## 8. Verification commands (no Docker)

```bash
# one-time, as the PostgreSQL superuser
psql -h localhost -p 5432 -U postgres -c "CREATE ROLE naas LOGIN PASSWORD 'naas'" \
  -c "CREATE DATABASE naas OWNER naas" -c "CREATE DATABASE naas_test OWNER naas"

cd backend
export DATABASE_URL="postgresql://naas:naas@localhost:5432/naas_test?schema=public"
npx prisma migrate deploy && npm run build && npx jest && npm run test:e2e
cd ../sdk/javascript && npm test            # + NAAS_BASE_URL=http://localhost:3000 npm run test:integration with a running backend
cd ../../frontend/dashboard && npm run build
cd ../../sdk/examples/react-demo && npm run build
```
