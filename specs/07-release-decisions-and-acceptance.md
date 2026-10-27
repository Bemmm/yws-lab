# Release 1.0 decisions and acceptance matrix

- ID: e20ad868-c5d9-4b4b-b3cb-cb4092c68d14
- Version: 1
- Updated: 2026-10-27T09:22:50.254886Z
- Linked tasks: None

---

# YWS-Lab 1.0 release decisions and acceptance matrix

Status: planning baseline, 27 October 2026. The orchestrator owns implementation and PR decisions. Scope changes must update the affected spec, Tasksurf story and acceptance check together.

## Decisions fixed for 1.0
| Area | Decision |
|---|---|
| Release | One release, version 1.0.0 |
| App boundary | Standalone now; export/mapping boundary for future YWS platform |
| Accounts | Telegram-only sign-in through official OIDC authorization-code flow |
| Roles | Regular account can use plans; whitelist grants methodologist access to progress; no student role |
| Progress collaboration | All whitelisted methodologists share the same cohort, roster, selected modules and assessments |
| Modules | Methodologist chooses distinct module numbers 1–12 per cohort and can add more later; scored modules cannot be removed casually |
| Builder | Private plan library, curated catalog, autosave, preview, public read-only link and print |
| Initial data | Operator CSV import with dry-run/idempotency; manual entry if sheets are absent/unusable |
| UI | Ukrainian-first copy, accessible light work surface/dark navigation; red-wordmark knot logo |
| PR flow | Main orchestrator reviews and decides PRs; user approval is not a release gate |

## Gate A — specification and design
Evidence: [shared spec](https://tasksurfing.app/?document=247c49d2-5916-4848-8b94-4bab36ed3f1a), [builder spec](https://tasksurfing.app/?document=f7b9e0ac-43b2-450e-919b-290a39e664ae), [progress spec](https://tasksurfing.app/?document=4b22c089-7e06-45ab-95cd-6953c9ca41e7), [design system](https://tasksurfing.app/?document=f2f31bba-28c1-4a4e-a6fd-9cf7eab3bc9c), [screen blueprints](https://tasksurfing.app/?document=3f3b15ec-ebdd-4607-9814-1cb4e7c7f612). Each implementation story links to its relevant source.

## Gate B — function
- Telegram account can create, edit, duplicate, print and share only its own plans; autosave/retry/conflict works.
- Catalog content has cleared display/print rights and a readable text fallback.
- Methodologist whitelist is enforced server-side; regular users and anonymous users cannot access progress by direct URL or API.
- Methodologists can jointly create/select cohorts, add teacher-students, choose modules, assess 16 competencies and view consistent student/group calculations.
- Share token revocation and methodologist access revocation take effect on subsequent requests.

## Gate C — data and quality
- Database migrations run from empty state and have a rollback/restore path.
- Current cohort data is imported or entered; a methodologist checks counts and representative scores against source records.
- Automated checks cover score boundaries, ownership/access, token invalidation, save conflicts and core journeys.
- Keyboard, screen-reader, mobile, contrast, and stated performance targets pass under recorded conditions.
- No sensitive scores, roster details, share tokens or secrets appear in public pages, logs or source control.

## Gate D — operations
- Production domain and Telegram bot allowed URLs configured; credentials stored outside source control.
- Backups and a restore test are complete; monitoring/error visibility and rollback are ready.
- Operator instructions cover whitelist changes, CSV imports, catalog rights/removal and cohort correction.
- Reference screenshots are removed from the workspace before release and never committed.

## Inputs needed during implementation
Telegram bot/client credentials and allowed production URL; production hosting/database account; licensed pose names/images; current student spreadsheet or confirmation of manual entry. These inputs have explicit stories and are requested only when their tasks reach execution.

