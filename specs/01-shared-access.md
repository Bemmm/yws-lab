# YWS-Lab 1.0 — Shared product and access spec

- ID: 247c49d2-5916-4848-8b94-4bab36ed3f1a
- Version: 2
- Updated: 2026-10-27T09:08:35.332094Z
- Linked tasks: None

---

# YWS-Lab 1.0 — Shared product and access specification

Status: adapted 1.0 specification, 27 October 2026. This document replaces Papaya account, student-directory and lesson dependencies for the two YWS-Lab modules.

## Product boundary
- Standalone web app for now. Future integration with the custom YWS platform is an architectural boundary, not a dependency of 1.0.
- Two areas: **Training plans** for every signed-in account; **Student progress** for whitelisted methodologists only.
- The progress area is private to the school. Teacher-students are cohort roster records, not a login role; they do not need accounts and cannot see assessments in 1.0. Other teachers cannot see that the progress data exists.
- One planned release: 1.0.0. The real YWS-Lab course currently has five modules and is in module 2. Each cohort's methodologists choose which numbered modules to track and how many; module selections and the teacher-student roster are shared among all whitelisted methodologists. Data can represent later cohorts without mixing assessments across cohorts.

## Identity and roles
- Telegram is the only sign-in provider. No passwords, Google sign-in or public role selection.
- 1.0 uses Telegram's official OpenID Connect authorization-code flow with PKCE. The user starts with **Continue with Telegram**, approves the login in Telegram, and returns to the app. The app does not ask users to type their Telegram account's own login code or phone number. This is the working interpretation of “Telegram code sign-in”; change it only if the product owner explicitly wants a bot-delivered one-time code.
- The server validates state, PKCE result, token signature, issuer, audience, expiry and nonce before creating a session. Telegram's stable subject is the account key; username and display name are mutable profile fields. See https://core.telegram.org/bots/telegram-login .
- First successful sign-in creates a regular account automatically. Each account can own training plans.
- A methodologist role is granted only through a server-side whitelist of Telegram account IDs by an authorized operator. Never infer the role from a Telegram username, chat membership, email or UI input.
- Removing a person from the whitelist revokes progress access on the next request and invalidates relevant sessions. Plans remain accessible to that account unless the account itself is disabled.
- Every progress read and mutation checks the role on the server. Unprivileged requests return the same non-disclosing result as a missing resource. The navigation hides progress for regular accounts, but hiding alone is not an access control.
- Record role grants/removals, assessment changes and student deletion with actor and timestamp. Do not log scores or personal details in general application logs.

## Sessions and data
- Secure, HttpOnly, SameSite cookies; HTTPS in production; session rotation after login; explicit sign-out; a finite idle and absolute lifetime specified in implementation configuration.
- Database entities: account, whitelist/role grant, program, program section, exercise, pose catalog entry, program share token, course, cohort, cohort module, student roster record, enrollment, assessment, assessment revision and audit event. Foreign keys prevent cross-account/cross-cohort leakage.
- Keep teacher-student roster records separate from account identities; no student login role or account-to-roster mapping is required. A student can be enrolled in more than one cohort without merging scores.
- Store UTC timestamps and show dates/times in the configured school timezone. The default is Europe/Kyiv.
- Backups and restore test are required before production data entry. Only minimal personal data required for roster and progress is collected.
- Existing spreadsheets are audited before migration. For 1.0, an operator can map/export source sheets to a documented CSV import template, preview validation failures, and import idempotently. No public spreadsheet upload UI is required. Manual entry remains available.

## UI language and future integration
- Initial release copy is Ukrainian. Store catalog pose names by locale and keep interface copy in translation files so another language can be added without changing records. User-authored text remains as entered. This is a working locale assumption to confirm before design sign-off.
- The future platform may use its own account system. Keep Telegram subject and YWS-Lab internal account ID separate; expose a documented export/mapping path rather than sharing the future platform's unfinished database in 1.0.

## Acceptance
- Regular signed-in account can create/view only its own plans and cannot access progress through navigation, direct URL or API.
- Whitelisted methodologist can use both modules and sees progress for the authorized school cohorts.
- Grant/revoke takes effect on server requests; identity cannot be forged through username changes or client-side state.
- Student records and scores persist across sessions and backups; one cohort's assessments never appear in another cohort by accident.

