# YWS Lab

YWS Lab 1.0 is a standalone Ukrainian language app for yoga training plans and course progress. Anyone with a Telegram account can sign in and create private plans. A separate whitelist grants methodologists access to the shared course roster and assessments. Student records have no app login or role.

## Status

The application builds and its core API flows have been tested against SQLite. A production release needs a Telegram OIDC client configured for the final domain and a verified methodologist subject. The starter pose catalog contains 24 text-only entries; the school must review terminology and approve any imagery before publishing it. Historical student scores have not been imported because source sheets have not been supplied.

## Local development

Requires Node.js 22.13 or newer.

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_dark_the_professor.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_strong_bloodstrike.sql
npm run dev
```

Create `.dev.vars` from `.env.example` for local Telegram sign-in. Register `http://localhost:5173/api/auth/callback` with the Telegram OIDC client for local use. Hosted settings belong in Sites environment variables, not in Git.

## Configuration

`APP_ORIGIN` is the exact HTTPS origin. `TELEGRAM_CLIENT_ID` and `TELEGRAM_CLIENT_SECRET` are issued by Telegram for the bot/client; configure its callback as `APP_ORIGIN/api/auth/callback`. `SESSION_SECRET` and `OPERATOR_KEY` are separate, random secrets with at least 32 characters. Set secrets in the hosting environment. See [operator access](docs/operator.md) for granting and revoking methodologist access.

The first person can sign in as a regular account as soon as Telegram is configured. Whitelist the stable Telegram OIDC subject before opening progress data to that methodologist. The progress API checks the whitelist on every request.

## Project documents

- [Shared identity and access](docs/specs/shared.md)
- [Training plan builder](docs/specs/builder.md)
- [Course progress](docs/specs/progress.md)
- [Design system](docs/design-system.md)
- [Screen blueprints](docs/screen-blueprints.md)

The 1.0 backlog and release acceptance matrix are in the YWS-Lab Tasksurf project. The standalone app is structured to be integrated into the future YWS platform later.
