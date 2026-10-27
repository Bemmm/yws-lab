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
