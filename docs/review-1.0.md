# Release review 1.0 (YWSLAB-30 / YWSLAB-65)

Scope: the review that sits on top of the automated axe checks in CI (all three viewports). Target: one Render free instance
(cold starts) + Neon free Postgres; laptops/tablets, sometimes phones.

## Security
Checked and fixed:
- Headers on every route (`next.config.ts` + `src/proxy.ts`): HSTS (production only), `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin` (`no-referrer` stays on `/p/*`), `X-Frame-Options: DENY`,
  `Permissions-Policy` with camera/mic/geolocation/payment/usb off.
- CSP is per-request and nonce-based (proxy): `script-src 'self' 'nonce-...' 'strict-dynamic'`, `connect-src 'self'`,
  `form-action 'self' https://oauth.telegram.org`, `frame-ancestors 'none'`, `base-uri 'self'`, `object-src 'none'`.
  Verified with a production build: Next's inline/bootstrap scripts carry the nonce. `unsafe-eval` only in dev.
- `img-src` allows Telegram avatars: `account.photo_url` is `https://t.me/i/userpic/...` (OIDC `picture`), which redirects to a
  `*.telesco.pe` CDN; redirects are CSP-checked, so that host is allowed too.
- `npm audit --omit=dev`: 0 vulnerabilities, no bumps needed.
- Authorization boundaries (plan ownership, methodologist check, non-disclosing 404) are covered by the integration and e2e suites.
- Long cache on `/asanas/*` and `/brand/*` (`public, max-age=31536000, immutable`). These files are never renamed in place; if one
  is replaced, give it a new name.

## Accessibility beyond axe
- Visible focus: global `:focus-visible` 3px outline in `--focus`. Dialogs use native `<dialog>` (trap, Esc, focus returns to opener).
- Library items: Enter/Space add to the first free slot (keyboard path for what drag does with a pointer); tab order follows the DOM.
- Fixed: no `prefers-reduced-motion` handling for transitions/pulses; added a global reduced-motion rule (progress skeleton already had one).
- Not tested with a real screen reader in this pass (no browser in the review sandbox); relies on labels/roles checked by axe.

## Performance
- Catalog: 1,239 SVGs. Items were already `loading="lazy"`; added width/height (no layout shift), `decoding="async"` and
  `content-visibility: auto` on grid cells so off-screen cells are not laid out. Tabs L1..L6/Other narrow the list.
- Client JS (gzip, route chunks; Next 16 no longer prints First Load JS). Before -> after:
  - `/plans` 35 -> 24 kB, `/p/[token]` 41 -> 31 kB, `/plans/[id]/preview` 36 -> 25 kB: the 120 kB asana manifest was
    pulled in only for `asanaParts` (alt text); moved to `asana-parts.ts`.
  - `/plans/[id]` 61 kB (needs the manifest; kept). `/progress/*` 22-24 kB. `/login` 17 kB.
- `/api/health` is one `select 1`; it does not touch sessions. `/login` reads cookies/searchParams so it is dynamic; it does no
  DB work for signed-out visitors beyond the session lookup, so a static login was not worth losing the nonce CSP.

## Database
Hot paths are indexed: `plan(owner_id, updated_at)`, `enrollment(cohort_id, student_id)` unique (leads with cohort),
`assessment_stage(enrollment_id, stage)` unique, `assessment_score` PK on stage, `session.token_hash` unique. No migration added.

## Accepted risks
- `style-src 'unsafe-inline'` (React style attributes, Tailwind/Next inline styles). Script injection is blocked by the nonce.
- CSP/headers are verified by curl and the CI e2e run, not in a real browser console here.
- First request after a Render cold start is slow (tens of seconds on the free plan); the health check keeps deploys honest,
  nothing keeps the instance warm.
- Rate limiting for share links is in-memory per instance (fine for one instance).

## Dark mode
- Dark mode (YWSLAB-73) follows the OS only; `scripts/check-contrast.mjs` (part of `npm run lint`) enforces WCAG AA for every text/background token pair in both themes, and the dark Playwright projects run axe at 1440 and 375.
