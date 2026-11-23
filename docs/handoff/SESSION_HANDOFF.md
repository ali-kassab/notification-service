# Session Handoff — Notification as a Service (NaaS)

_Last updated: 2026-11-23 (end of session 2)_

Permanent context, architecture, decisions and constraints are in [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md). Read it first. This file is the latest checkpoint only.

## 1. Project overview

A self-hostable notification service: a NestJS + Prisma + PostgreSQL + Socket.IO backend, a TypeScript SDK, a React demo and a React dashboard. All four were implemented and tested in session 1 and are on `main` (pushed, public repo `ali-kassab/notification-service`).

## 2. Task completed this session

**Project documentation** (session 1 handoff, §6 items 1–4), on local branch **`docs/project-documentation`** (created from `main` at `d7f4295`):

| File | Content |
|---|---|
| `README.md` (new) | Overview, diagram, features, stack, structure, setup with a local PostgreSQL (no Docker), env vars, API overview, auth model, SDK example, testing, limitations |
| `docs/architecture.md` (new) | Components, data model, send lifecycle, DELIVERED semantics, WebSocket lifecycle, credentials/isolation, cross-cutting concerns, limitations |
| `docs/integration-guide.md` (new) | Step-by-step integration (project + key, SDK send, user tokens, browser inbox, server-side inbox management, checklist, delivery states) |
| `docs/handoff/PROJECT_HANDOFF.md` (new) | Permanent reference incl. Git rules, **no-Docker rule**, Installed Skills and Reuse-First policies |
| `docs/handoff/CHANGELOG.md` (new) | 1.0.0 history + unreleased docs entry |
| `docs/handoff/SESSION_HANDOFF.md` (rewritten) | This file |

No application code, config or dependency was changed. All API, SDK and behaviour claims in the docs were checked against the source (DTOs, `notifications.service.ts`, delivery service, gateway, guards, SDK `server.ts`/`browser.ts`/`http.ts`/`types.ts`).

## 3. New constraint from the user (permanent, also in PROJECT_HANDOFF §6)

**Never use Docker in this project.** Docker Desktop was briefly launched this session, failed to start, and its processes were stopped right after the user's instruction. The docs now describe a native PostgreSQL setup. `docker-compose.yml` and `docker/` were left in place untouched, and the README labels them as "older setup, not used". Whether to delete them is the user's decision.

## 4. Verification actually executed (2026-11-23)

| Check | Result |
|---|---|
| Backend `npm run build` | success |
| Backend unit `npx jest` | **2 suites, 5/5 passed** |
| SDK unit `npm test` | **5/5 passed** |
| Dashboard `npm run build` | success |
| Demo `npm run build` | success |
| Backend e2e (54 tests) | **not run — blocked** (see §5) |
| SDK integration (3 tests) | **not run — blocked** (needs backend + DB) |
| Manual click-through of dashboard Send test / history / details / integration pages | not done (needs a running backend + DB) |

## 5. Blockers

1. **Database for e2e/integration tests.** Native PostgreSQL 17 (port 5432) and 16 (port 5433) are running as Windows services, but neither has the `naas` role (`password authentication failed for user "naas"`). Creating it needs the `postgres` superuser password, which the agent does not have. The user should run this once:
   ```
   "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -p 5432 -U postgres -c "CREATE ROLE naas LOGIN PASSWORD 'naas'" -c "CREATE DATABASE naas OWNER naas" -c "CREATE DATABASE naas_test OWNER naas"
   ```
2. **Push not done.** The user's standing instruction is to push only to "the authorized feature branch specified in PROJECT_HANDOFF.md", and no such branch has been designated. The work is committed locally on `docs/project-documentation` only. The user must name or approve the push branch.

## 6. Known issues (unchanged from session 1)

- `npm audit` (backend): high advisories in `effect`/`deepmerge-ts` via the Prisma 6 CLI and moderate ones in `glob`/`minimatch` via `@nestjs/cli`. Tooling only. Fixing them needs breaking major upgrades.
- Single-instance real-time delivery, no redelivery of un-acked events, broadcast without chunking, `recipientCount` not decremented on delete.
- `backend/.env`, `backend/.env.example` and `backend/test/setup-env.ts` default to port **5435** (the old Docker port). Override `DATABASE_URL` for the native server. Changing the committed defaults to 5432 is a small, optional follow-up.
- Dev servers may shift ports (5173/5174 taken on this machine), so keep `CORS_ORIGINS` in line with the actual origins.

## 7. Exact next steps

1. User: create the `naas` role and databases (§5.1), and authorize a push branch (§5.2).
2. Then, with `DATABASE_URL="postgresql://naas:naas@localhost:5432/naas_test?schema=public"`: `cd backend && npx prisma migrate deploy && npm run test:e2e` (expect 54 passing), start the backend with a dev `DATABASE_URL` pointing at the `naas` database (`npx prisma migrate deploy && npm start`), then `cd sdk/javascript && NAAS_BASE_URL=http://localhost:3000 npm run test:integration` (expect 3 passing).
3. Optional (session 1 §6 item 5): `sdk/javascript/README.md`, and a manual click-through of the dashboard pages listed in §4.
4. Push `docs/project-documentation` to the authorized branch only after approval. Never push to `main` directly.
