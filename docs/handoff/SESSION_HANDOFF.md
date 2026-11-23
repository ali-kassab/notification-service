# Session Handoff — Notification as a Service (NaaS)

_Last updated: 2026-11-23 (end of session 2)_

Permanent context, architecture, decisions and constraints are in [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md). Read it first. This file is the latest checkpoint only.

## 1. Project overview

A self-hostable notification service: a NestJS + Prisma + PostgreSQL + Socket.IO backend, a TypeScript SDK, a React demo and a React dashboard. All four were implemented in session 1 and are on `main`. This session finished the remaining documentation and verification work. **Every planned work item is now done.**

## 2. Work completed this session (branch `docs/project-documentation`, pushed)

| File | Change |
|---|---|
| `README.md` | New: overview, diagram, features, stack, structure, native PostgreSQL setup (no Docker), env vars, API, auth model, SDK example, testing, limitations |
| `docs/architecture.md` | New: components, data model, send/real-time lifecycles, DELIVERED semantics, credentials, limitations |
| `docs/integration-guide.md` | New: step-by-step integration (SDK, REST, Socket.IO, checklist) |
| `sdk/javascript/README.md` | New: SDK reference (server + browser APIs, errors, development) |
| `docs/handoff/PROJECT_HANDOFF.md` | New: permanent reference (Git rules, no-Docker rule, local DB, authorized branch, Skills and Reuse-First policies) |
| `docs/handoff/CHANGELOG.md` | New |
| `docs/handoff/SESSION_HANDOFF.md` | Rewritten (this file) |
| `.claude/launch.json` | Added a `backend` preview config (`npm --prefix backend start`, port 3000) |

No application source code was changed. The documented API and SDK behaviour was checked against the source.

## 3. Environment decisions made this session

- **No Docker** (the user's instruction). Docker Desktop was briefly launched before the instruction arrived, never finished starting, and was stopped.
- The machine's PostgreSQL services (17 on 5432, 16 on 5433) require a superuser password the agent does not have. Instead, a **private PostgreSQL 17 instance** was created with the installed binaries: data directory `D:\Workspace\naas-pgdata` (outside the repo), port **5435**, user `naas`/`naas`, databases `naas` + `naas_test`, both migrated. It matches the committed defaults, so no config change was needed. Start/stop commands are in PROJECT_HANDOFF §6. **It was stopped at the end of the session.**
- The local dashboard test account for the dev DB is in `D:\Workspace\naas-pgdata\DEV_ACCOUNT.txt` (not in the repo).
- `docker-compose.yml` and `docker/` were left untouched, and the README marks them as unused. Deleting them is the user's decision.

## 4. Verification actually executed (2026-11-23)

| Check | Result |
|---|---|
| Backend `npm run build` | success |
| Backend unit (`npx jest`) | 2 suites, **5/5 passed** |
| Backend e2e (`npm run test:e2e`, private PG `naas_test`) | 4 suites, **54/54 passed** |
| SDK unit (`npm test`) | **5/5 passed** |
| SDK integration (`NAAS_BASE_URL=http://localhost:3000 npm run test:integration`) | **3/3 passed** |
| Dashboard / demo `npm run build` | success / success |
| `GET /api/v1/health` | `{"status":"ok"}` |
| Dashboard click-through (built-in browser, `localhost:5173` → backend `:3000`) | Register ✓, create project ✓, Send test one user / several users (3) / broadcast (3) ✓, invalid metadata JSON rejected ✓, history list + target filter in URL ✓, details page with per-recipient status + status filter ✓, delivered/read counts updated after alice's client fetched and read ✓, delete for all recipients ✓, API key create (shown once) + revoke → REVOKED ✓, integration page shows the project key and API URL ✓, user token cannot send (401) ✓ |

The React demo was not re-run in the browser this session (it was verified in session 1, and its build passes).

## 5. Known issues (unchanged, documented in README / architecture)

- `npm audit` (backend): advisories in Prisma 6 CLI and Nest CLI tooling dependencies. Fixing them needs breaking major upgrades, which are not done by policy.
- Single-instance real-time delivery, no redelivery of un-acked events, broadcast without chunking, `recipientCount` not decremented on delete.
- Dev ports can shift when 5173/5174 are taken, so keep `CORS_ORIGINS` in line with the actual origins.

## 6. Git state

- `main` is unchanged at `d7f4295` (= `origin/main`).
- `docs/project-documentation` is pushed to `origin` (authorized by the user on 2026-11-23). There is no PR and no merge; both need the user's request.

## 7. Next step

No planned work remains. Possible next actions, only at the user's request: open a PR or merge `docs/project-documentation` into `main`, delete the unused Docker files, or pick up an item from §5.
