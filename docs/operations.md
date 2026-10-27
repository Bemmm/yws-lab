# YWS-Lab — Operations guide

For the owner and any future operator. Product rules are in `specs/`; this file covers running the app.

## 1. Environments

| Environment | Where | Database | Notes |
|---|---|---|---|
| Local | Your machine | Local Postgres 16 (`DATABASE_URL` in `.env.local`) | Demo data allowed. Telegram sign-in needs `APP_URL=http://localhost:3000` registered in BotFather. |
| Production | Render web service `yws-lab`, free plan, region Frankfurt | Neon (free plan) | Real student data. No staging environment in 1.0. |

Never point a local `.env.local` at the production database, and never run `db:seed-demo` against it.

## 2. Environment variables

Set on Render (Dashboard → `yws-lab` → Environment). Locally, put them in `.env.local`. Never commit `.env*`.

| Variable | Purpose | Where the value comes from |
|---|---|---|
| `DATABASE_URL` | Postgres connection used by the app and migrations on start | Neon console → project → Connect → copy the connection string for the production branch. Keep `sslmode=require`. |
| `DATABASE_URL_TEST` | Database used by integration tests | Local only, a throwaway database. Never a production URL. Unset on Render. |
| `APP_URL` | Public origin, no trailing path, e.g. `https://yws-lab.onrender.com` | Your Render URL (or custom domain). Must match the BotFather Allowed URLs. |
| `TELEGRAM_CLIENT_ID` | Telegram OIDC client id | @BotFather → your bot → Bot Settings → Login Widget. |
| `TELEGRAM_CLIENT_SECRET` | Telegram OIDC client secret | Same BotFather screen. Treat as a password. |
| `SESSION_SECRET` | Seals the OAuth state/nonce/PKCE verifier during sign-in. Sessions themselves are random tokens stored hashed in the database. | Generate: `openssl rand -base64 48`. Use a different value per environment. Rotating it only breaks sign-ins in progress. |
| `METHODOLOGIST_TELEGRAM_IDS` | Comma-separated numeric Telegram user IDs granted methodologist access | Ask the person for their numeric Telegram user ID. Do not use a username. |
| `METHODOLOGIST_PHONES` | Comma-separated phone numbers in E.164, e.g. `+380671234567` | Ask the person. Matches only if they share their phone during sign-in. |
| `TELEGRAM_ISSUER`, `TELEGRAM_AUTH_URL`, `TELEGRAM_TOKEN_URL`, `TELEGRAM_JWKS_URL` | Override Telegram endpoints | Tests only. Leave unset in production. |
| `NODE_VERSION` | Set in `render.yaml` as `22` | Already configured. |

BotFather setup for the login widget:

1. Open @BotFather, pick the bot, go to Bot Settings → Login Widget.
2. Under Allowed URLs add exactly `APP_URL` and `APP_URL/auth/callback`.
3. Copy the Client ID and Client Secret into Render.

If sign-in fails with a redirect or origin error, the Allowed URLs do not match `APP_URL` character for character.

## 3. Methodologist access

Access is a whitelist in two env vars. There is no admin screen in 1.0.

**Grant:** Render → `yws-lab` → Environment → add the numeric Telegram ID (or E.164 phone) to the list → Save. Render restarts the service with the new value. The next request from that person is treated as methodologist.

**Revoke:** remove the entry the same way. Access ends on the next request after the restart. Existing sessions do not need to be purged, because the role is read from the environment on every request. The person's plans stay accessible to their account.

Record each change yourself (who, when, why). The in-app audit log covers assessment and student changes, but the whitelist lives in Render, so Render's event log is the only record of the env change.

## 4. Deploy

- Push or merge to `main`. Render builds (`npm ci && npm run build`) and starts (`npm run start`) automatically.
- `npm run start` runs migrations first (`scripts/migrate.mjs`), then `next start`. A failed migration stops the start; the health check should then keep the previous deploy serving. Confirm in Events.
- Before merging, make sure CI is green: `npm run check` locally runs lint, typecheck, tests and build.
- Watch the deploy in Render → Events. Then check `GET /api/health`.

## 5. Rollback

**Code:** Render → `yws-lab` → Deploys → choose the last good deploy → Rollback. This redeploys the old build without touching data.

**Schema:** a code rollback does not undo migrations. Migrations are additive (new tables, columns, indexes), so the older code keeps working against the newer schema. Do not write a migration that drops or renames a column in the same release as a code change that depends on it.

**Data:** if a migration or bad write must be undone, restore the database instead (section 6). Restoring loses everything written after the restore point, so take the restore point first and decide with that in mind.

## 6. Backups and restore

Neon free plan keeps point-in-time history for a short window (hours, not days). Check the exact window in the Neon console before relying on it. Treat it as the only automatic protection.

**Create a restore branch (no change to production):**

1. Neon console → project → Branches → Create branch.
2. Set the parent to the production branch and choose a point in time inside the window.
3. Connect to the new branch with its own connection string. Verify rows (section 6.1). Delete the branch when done.

**To roll production back to a restore branch:** this is a manual decision. Stop writes first (Render → Suspend the service), restore or promote the branch in Neon, point `DATABASE_URL` at it, and resume the service. Write the decision and timestamps in your change log.

### 6.1 Restore test (run before entering real student data, then quarterly)

1. Create a restore branch from a recent point in time.
2. Connect with `psql` (or the Neon SQL editor) and check the row counts:
   `select count(*) from account; select count(*) from cohort; select count(*) from enrollment; select count(*) from assessment_score;`
3. Compare against production counts taken at the same time. Small differences are expected only for writes after the restore point.
4. Run the app against the branch locally (`DATABASE_URL=<branch url> npm run dev`). Sign in as a methodologist, open a cohort and confirm a known assessment shows the right score.
5. Record the date, branch used, counts and result. Delete the branch.

The test is not complete until step 4 has been done by hand.

## 7. Demo data

`npm run db:seed-demo` creates the cohort "Демо-потік" with five students. Use it only on local or staging databases.

- The script refuses to run when `NODE_ENV=production`, but do not rely on that alone. Run it only against a local `DATABASE_URL`.
- It is safe to re-run; it does nothing if the demo cohort already exists.
- Demo data is fictional. Never mix it with real cohorts in a database that holds student data.

## 8. Free-plan caveats

- **Render free:** the service sleeps after about 15 minutes without traffic. The next request takes roughly 30–60 seconds while it wakes. Tell methodologists to expect this on first load.
- **Neon free:** compute suspends after a period of inactivity. The first query after that adds a short delay. The connection string does not change.
- **Neither plan is an SLA.** Plan limits (storage, history window, compute hours) can change. Re-check them before the launch and before adding more students.
- Render's free plan has no persistent disk. Do not store uploads or local files on the service.

## 9. Incident basics

1. **Check health:** `GET /api/health` returns `200 {"ok":true,"db":true}`. `503` with `db:false` means the app cannot reach Neon.
2. **Check logs:** Render → `yws-lab` → Logs. Errors include the request path and status, not user data.
3. **Check Neon:** console → project status and compute state. A suspended compute wakes on the next query.
4. **Check the last deploy:** if the problem started with a deploy, roll back (section 5).
5. **Check Telegram:** if sign-in fails, verify BotFather Allowed URLs and `TELEGRAM_CLIENT_SECRET`.

**Never paste student data into tickets, chat, or issue trackers.** Describe the problem by row count, cohort name without names, or error message only. Never paste connection strings, `SESSION_SECRET`, or Telegram secrets either. If a secret leaks, rotate it in Render and in BotFather, then redeploy.
