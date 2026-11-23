# Changelog

## Unreleased — documentation (branch `docs/project-documentation`, not pushed)

- Added `README.md`: overview, architecture diagram, stack, features, structure, setup with a local PostgreSQL (no Docker), environment variables, API overview, authentication model, SDK example, testing.
- Added `docs/architecture.md`: components, data model, send and real-time lifecycles, delivery semantics, credentials, cross-cutting concerns, limitations.
- Added `docs/integration-guide.md`: step-by-step integration with the SDK, REST and Socket.IO.
- Added `docs/handoff/PROJECT_HANDOFF.md` (permanent reference) and this changelog.

## 1.0.0 — initial implementation (2026-11-22/23, on `main`, pushed)

- `e283fed` Project scaffolding and PostgreSQL setup.
- `7ac447c` NestJS backend: auth, projects, API keys, notifications (single/multi/broadcast), inbox API, Socket.IO delivery with acks, stats, validation, rate limiting; 5 unit + 54 e2e tests.
- `21d83dd` TypeScript SDK: `NotificationClient` and `NotificationInbox`; 5 unit + 3 integration tests.
- `325fed3` React integration demo with a minimal app backend.
- `5087743` React dashboard: overview, projects, API keys, history, details, send test, integration page.
- `3655125`, `d7f4295` Session handoff document and publication status.
