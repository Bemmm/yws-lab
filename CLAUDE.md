# YWS-Lab — rules for agents

Internal web app for YWS methodologists and teachers: **training plan builder** (every signed-in account) and **student course progress** (whitelisted methodologists only). One release: 1.0.0.

## Source of truth

- `specs/` — product specs. Code follows specs; if they disagree, fix the spec in the same PR (and say why in the PR body). `specs/archive/` is provenance only.
- `plan/backlog.md` — every story/task with status. A PR that does a task flips its status in the same PR (`todo` → `done`).
- Design system: **YWS Lab** (tokens and component rules). The app copy of the tokens is `src/styles/tokens.css`; never hard-code colours, radii or font sizes outside it.
- `vendor/papaya-builder/` — original Papaya builder source, read-only reference for the port. Never import from it at runtime.

## Stack (decided — do not change without a spec update)

- Next.js 16 (App Router, server actions + route handlers), React 19, TypeScript strict.
- Tailwind CSS 4 with the design tokens as CSS variables; font Onest (self-hosted in `src/app/fonts`).
- Postgres: Neon in production, local Postgres 16 in dev/CI. Drizzle ORM + drizzle-kit SQL migrations in `drizzle/`. Migrations run on app start (`npm run start`).
- Auth: Telegram OIDC (authorization code + PKCE), ID token verified with `jose` against Telegram JWKS. Sessions: opaque random token in an HttpOnly Secure SameSite=Lax cookie, hashed in the `session` table.
- Methodologist whitelist: env `METHODOLOGIST_TELEGRAM_IDS` and `METHODOLOGIST_PHONES` (comma-separated). Checked on the server on every progress request.
- i18n: `uk` (default) and `ru`; typed dictionaries in `src/i18n/{uk,ru}.ts`. No user-facing string literals in components.
- Tests: Vitest (unit + integration against a real Postgres), Playwright for a few release journeys.
- Hosting: one Render web service (free plan, Frankfurt), npm.

## Repo layout

```
src/app/            routes (App Router)
src/server/         db (schema, client), auth, authz, domain services — server-only
src/features/       builder/, progress/ — UI + client logic per module
src/components/     design-system components (Button, Card, SkillBar, …)
src/i18n/           dictionaries + helpers
src/styles/         tokens.css, globals.css
drizzle/            migrations
public/asanas/      1,239 asana SVGs (school-owned)
tests/              integration + e2e
```

## Hard rules

- Every progress read/write checks the methodologist role **on the server**; non-methodologists get the same response as "not found". Hiding the nav item is not access control.
- Every plan read/write checks ownership on the server.
- Never log student names, notes, scores, share tokens or secrets. Never commit `.env*` or credentials.
- Scores: integer 0–10 or null (unassessed). Zero is a real score. Calculations follow `specs/03-student-progress.md` §6 exactly; round only for display.
- No ranking or sorting students by score. Ever.
- Accessibility: keyboard path, visible focus (`--focus`), labels, 44px targets, WCAG AA contrast.

## Workflow (autonomous — no human review)

1. The orchestrator picks tasks from `plan/backlog.md`, respecting `Links: blocks …`.
2. One task (or a small set of tightly coupled tasks) = one branch `task/YWSLAB-NN-short-name` = one PR to `main`.
3. Before opening a PR the implementer runs `npm run check` (lint + typecheck + test + build) locally. CI (`.github/workflows/ci.yml`) must be green.
4. A reviewer agent checks the diff against the task's spec section and these rules, then reports blocking issues only. The orchestrator fixes or merges (squash). `main` deploys to Render automatically.
5. Commit messages: imperative, reference the task key.

## Saving tokens

- Read the spec section and the files you change, not the whole repo. Use Grep/Glob before Read.
- Don't paste large files into reports; report in ≤150 words: what changed, what's left, anything blocking.
- Model routing: architecture, specs, cross-cutting decisions → Opus (orchestrator). Feature implementation → Sonnet. Mechanical edits, reviews of small diffs, string/i18n work → Haiku.

## Commands

```
npm run dev          # local dev (needs DATABASE_URL)
npm run db:generate  # create a migration from schema changes
npm run db:migrate   # apply migrations
npm run db:seed-demo # demo cohort "Демо-потік" (local/staging only; refuses NODE_ENV=production)
npm run check        # lint + typecheck + test + build — must pass before a PR
```
