# YWS-Lab

App for YWS methodologists and teachers: training plan builder and student course progress.

- `specs/` — product specs (source of truth). `specs/archive/` keeps the Papaya baselines for provenance only.
- `plan/work-plan.md` — Release 1.0 work order; `plan/backlog.md` — epics, stories and tasks with status.

Specs and plan were imported from Tasksurf on 2026-10-27 and now live only here.

## Commands

Needs Node 22 and a local Postgres 16. Copy `.env.example` to `.env.local` and fill in `DATABASE_URL` (and `DATABASE_URL_TEST` for tests).

```
npm ci
npm run dev          # local dev
npm run db:generate  # create a migration from schema changes (src/server/db/schema.ts -> drizzle/)
npm run db:migrate   # apply migrations to DATABASE_URL
npm run check        # lint + typecheck + test + build
npm run start        # migrate, then next start -p ${PORT:-3000}
```

Health check: `GET /api/health`.

## Telegram setup

Sign-in uses Telegram's OpenID Connect flow (authorization code + PKCE).

1. In Telegram open @BotFather, create a bot (or pick an existing one), then go to Bot Settings → Login Widget.
2. Set Allowed URLs to `APP_URL` and `APP_URL/auth/callback` (for local dev use your dev origin, e.g. `http://localhost:3000`).
3. Copy the Client ID and Client Secret into `TELEGRAM_CLIENT_ID` and `TELEGRAM_CLIENT_SECRET`.
4. Set `APP_URL` (public origin, no trailing path) and a long random `SESSION_SECRET` (e.g. `openssl rand -base64 48`).
5. Methodologists: list Telegram user IDs in `METHODOLOGIST_TELEGRAM_IDS` and/or E.164 phones in `METHODOLOGIST_PHONES` (comma-separated). Changes apply on the next request after redeploy.

The `TELEGRAM_ISSUER`, `TELEGRAM_AUTH_URL`, `TELEGRAM_TOKEN_URL` and `TELEGRAM_JWKS_URL` overrides exist for tests only.
