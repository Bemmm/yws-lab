# YWS-Lab — Release 1.0 backlog

Imported from Tasksurf on 2026-10-27. IDs keep their Tasksurf keys. Status: `todo` / `backlog` / `in-progress` / `done` — the orchestrator updates this file in the same PR that does the work.

## YWSLAB-1 · release · `todo` — Release 1.0 — YWS-Lab launch

Single planned release for the standalone YWS-Lab app. Exit criteria: approved YWS-Lab specs, design system, Telegram sign-in, account-wide workout builder, methodologist-only student progress, data setup/migration, accessibility, security, testing and deployment. Scope details follow the adapted specs; no coding begins before the work plan is complete.

## YWSLAB-2 · epic · `todo` — Product specification and release scope

Turn imported Papaya documents into YWS-Lab specifications before implementation. Resolve standalone app boundaries, roles, data ownership, and Release 1.0 acceptance criteria.

### YWSLAB-3 · story · `backlog` — Adapt workout builder specification

Use the imported PAP-8 baseline. Decide catalog, sharing, print, language and exercise rules; remove Papaya scheduling and student-account assumptions; define acceptance criteria.

### YWSLAB-9 · story · `backlog` — Adapt student progress specification

Use PAP-101 baseline. Define five-module stages, 16 competencies, methodologist-only access, roster and data-entry rules; write YWS-Lab acceptance criteria.

### YWSLAB-10 · story · `backlog` — Specify sign-in, roles, data and future integration

Define Telegram code flow, account lifecycle, whitelist administration, data model, import, future platform boundary and operational needs.

### YWSLAB-11 · story · `backlog` — Freeze Release 1.0 scope and acceptance plan

Release 1.0 scope, specs, design system, engineering breakdown, dependency links and acceptance matrix are recorded. Implementation inputs (credentials, catalog rights, source sheets, hosting) are tracked in delivery stories.

Links: blocks YWSLAB-16

## YWSLAB-4 · epic · `todo` — Design system and product UX

Build YWS-Lab visual language from supplied references, then specify responsive and accessible screens for both modules.

### YWSLAB-12 · story · `backlog` — Audit references and select logo

Extract reusable visual principles from the supplied screenshots. Compare both logo variants against chosen backgrounds and select one. Record rationale.

### YWSLAB-13 · story · `backlog` — Create design tokens and component system

Define typography, color, spacing, surfaces, states, icons and controls; document contrast, focus, errors and empty/loading states.

Links: blocks YWSLAB-14; blocks YWSLAB-15

### YWSLAB-14 · story · `backlog` — Design workout builder flows

Design plan list, editor, save/conflict behavior and preview for desktop and mobile, including approved catalog or sharing.

### YWSLAB-15 · story · `backlog` — Design methodologist progress flows

Design course overview, roster, assessments, competency trends and restricted-access states for desktop and mobile.

## YWSLAB-5 · epic · `todo` — App foundation, identity and data

Create the standalone app foundation, secure Telegram sign-in, authorization and persistence with a documented integration boundary.

### YWSLAB-16 · story · `backlog` — Set up app, quality gates and environments

Choose stack from requirements; initialize repo, config, migrations, local development, CI and environments; keep secrets out of source control.

Links: blocks YWSLAB-17; blocks YWSLAB-19

#### YWSLAB-35 · backend · `done` — Define app architecture and bootstrap repository

Choose stack from approved specs, create app structure, env schema and migration setup; document local commands. Acceptance: clean checkout runs locally with no secrets committed.

#### YWSLAB-36 · test · `done` — Set up CI and environment checks

Clean checkout installs and runs checks; CI runs lint/typecheck, unit and end-to-end gates with test data; environment variables are documented without secrets.

#### YWSLAB-67 · design · `done` — Prepare selected YWS-Lab logo asset

Use the red-lab wordmark source; export optimized production sizes, inspect transparency and legibility on dark navigation/light sign-in, and choose a simplified favicon-sized mark.

### YWSLAB-17 · story · `done` — Implement Telegram-only sign-in and account lifecycle

Implement official Telegram OIDC authorization-code sign-in with PKCE, server-side token validation, session handling, sign-out, errors and recovery. No password, Google or student role. Follow the shared YWS-Lab access spec.

#### YWSLAB-37 · backend · `done` — Integrate Telegram OIDC callback and sessions

Use authorization code with PKCE/state/nonce; validate ID token server-side and establish secure session keyed by stable Telegram subject. Cover expiry, replay and failure paths.

#### YWSLAB-38 · frontend · `done` — Build sign-in and account controls

Implement branded Telegram entry, canceled/error/retry states, account menu and sign-out; responsive and keyboard usable.

### YWSLAB-18 · story · `done` — Enforce methodologist whitelist

Restrict progress reads and writes in API and UI; provide controlled whitelist administration and an audit trail for access changes.

Links: blocks YWSLAB-25

#### YWSLAB-39 · backend · `done` — Implement whitelist grants and server authorization

Persist grants/revocations with audit actor/time; enforce role on every progress read/write and return non-disclosing failures; revoked user loses access on next request.

#### YWSLAB-40 · test · `done` — Test role and ownership boundaries

Verify regular accounts cannot access progress through navigation, direct URL or API; verify plan ownership and whitelist revocation.

### YWSLAB-19 · story · `backlog` — Implement persistent data model and migrations

Store accounts, roles, plans, courses, shared cohorts, selected cohort modules, teacher-student roster records, enrollments, assessments and audit history. Keep roster records separate from login accounts; version schema and define backups.

Links: blocks YWSLAB-21; blocks YWSLAB-25

#### YWSLAB-41 · backend · `done` — Migrate account, plan and pose schemas

Create versioned tables/constraints for account, plan, sections, exercises, pose catalog, share tokens and audit metadata; migration works from empty database.

#### YWSLAB-42 · backend · `done` — Migrate cohort, module and assessment schemas

Create shared course/cohort, selected module, teacher-student roster, enrollment, assessment and revision tables; prevent duplicate modules/enrollments and cross-cohort joins.

### YWSLAB-20 · story · `backlog` — Document future platform integration boundary

Define stable identity and data assumptions plus an export path so standalone YWS-Lab can integrate later.

#### YWSLAB-43 · analysis · `todo` — Define future platform export and identity mapping

Document stable internal IDs, Telegram subject separation, export schema and migration boundary; no dependency on unfinished platform in 1.0.

## YWSLAB-6 · epic · `todo` — Workout builder

Deliver saved yoga training plans for every signed-in account, based on the adapted builder specification.

### YWSLAB-21 · story · `backlog` — Create and manage plans

List, search, create, rename, duplicate and delete owned plans; handle empty, validation and permission states.

Links: blocks YWSLAB-22

#### YWSLAB-44 · backend · `todo` — Implement private plan library API

Owner-scoped create/list/search/duplicate/delete with validation, pagination and no cross-owner leaks.

#### YWSLAB-45 · frontend · `todo` — Build plan library screen

Show list, summary, search, empty/no-match states and actions on desktop/mobile per blueprints.

### YWSLAB-22 · story · `backlog` — Build structured plan editor

Edit sections, ordered exercises, time or breaths, notes and custom exercises; enforce approved limits and keyboard/touch controls.

Links: blocks YWSLAB-23; blocks YWSLAB-33

#### YWSLAB-46 · backend · `todo` — Implement section and exercise mutations

Validate 20 sections/200 exercises, duration or breaths, notes and order; make move/duplicate/remove atomic.

#### YWSLAB-47 · frontend · `todo` — Build responsive plan editor

Inline title/description, section/exercise cards, catalog insertion, custom entries, drag and accessible move actions on desktop/mobile.

### YWSLAB-23 · story · `backlog` — Add reliable autosave and conflict handling

Persist edits without a save button; show status, retry failures and prevent stale windows from overwriting newer versions.

Links: blocks YWSLAB-29

#### YWSLAB-48 · backend · `todo` — Add versioned plan saves

Conditional version checks reject stale writes; deletion and retry are idempotent; no partial reorder persisted.

#### YWSLAB-49 · frontend · `todo` — Build save, retry and conflict states

Show saving/saved/error; retain pending edits offline; refresh on focus; handle stale/deleted plan without silent overwrite.

### YWSLAB-24 · story · `backlog` — Build plan preview

Render readable plan details and duration summary on mobile and desktop; include print behavior if retained by approved spec.

#### YWSLAB-50 · frontend · `todo` — Build shared plan renderer and print styles

Owner preview and public view use same readable renderer; print hides controls and remains readable at 375 px.

### YWSLAB-32 · story · `backlog` — Provide curated pose catalog

Provide a curated shared pose catalog with stable IDs, localized names, difficulty, search/filter, licensed images and text fallback. Content rights for app/share/print are a release gate.

#### YWSLAB-51 · analysis · `todo` — Prepare licensed pose catalog data

Define stable pose IDs, localized names, difficulty and image rights. Import content only after school confirms rights for app/share/print.

#### YWSLAB-52 · frontend · `todo` — Build catalog search and filter panel

Search displayed name, filter difficulty, show 60 then more, support click/add and mobile bottom sheet; missing image falls back to name.

### YWSLAB-33 · story · `backlog` — Share and print plans

Provide one revocable read-only public link for a nonempty plan, generic invalid state, responsive anonymous page and browser print output; no student/course or private account data.

Links: blocks YWSLAB-29

#### YWSLAB-53 · backend · `todo` — Implement secret share links and revocation

One active high-entropy token per nonempty plan; store hash, block cache/index/leakage, revoke immediately, return generic invalid state.

#### YWSLAB-54 · frontend · `todo` — Build link management and public page

Create/copy/revoke dialog, anonymous read-only page and invalid-link state; no owner or course metadata.

## YWSLAB-7 · epic · `todo` — Student course progress

Give whitelisted methodologists a private view of each student's progress through the YWS-Lab teacher course.

### YWSLAB-25 · story · `backlog` — Manage course and student roster

Let whitelisted methodologists create a shared YWS-Lab cohort, select distinct numbered modules 1–12 (initially or later), and jointly manage its teacher-student roster and starting profiles. Unscored modules may be removed; scored modules retain assessments. Teacher-students are roster records, not app roles.

Links: blocks YWSLAB-26; blocks YWSLAB-34

#### YWSLAB-55 · backend · `todo` — Implement shared cohort and module configuration

Methodologists select unique module numbers 1–12, add later, remove only unscored modules; optimistic concurrency prevents one editor overwriting another.

#### YWSLAB-56 · frontend · `todo` — Build cohort, module and roster management

Shared cohort selector, Manage modules, create/find/enroll teacher-students, starting profiles, archive state and duplicate messages.

### YWSLAB-26 · story · `backlog` — Record stage competency assessments

Enter 0–10 scores for the 16 competencies at Point 0, each configured module, and Final. Unconfigured modules have no assessment stage. Apply stage-entry, partial-score, conflict and shared-methodologist rules from the adapted spec.

Links: blocks YWSLAB-27

#### YWSLAB-57 · backend · `todo` — Implement atomic assessment writes

Validate 16 stable competencies, 0–10 or empty, configured stage order and versions; audit changes without logging private scores.

#### YWSLAB-58 · frontend · `todo` — Build assessment form and conflict flow

Slider plus numeric input, prior score hint, K/16, Save/Cancel, unsaved-exit prompt, outage retry and stale-stage handling.

### YWSLAB-27 · story · `backlog` — Calculate levels and growth

Implement overall/group averages, stage deltas and dynamics labels exactly as approved spec defines; verify with deterministic examples.

Links: blocks YWSLAB-28

#### YWSLAB-59 · test · `todo` — Verify score calculations and boundary cases

Unit fixtures for complete/partial stages, group means, Point 0 gain, 0.3/1.5 thresholds, -2 competency decline and displayed rounding.

### YWSLAB-28 · story · `backlog` — Show student and group progress

Provide student detail, competency scales and history plus group overview/filtering; keep private data inaccessible to other accounts.

Links: blocks YWSLAB-29

#### YWSLAB-60 · frontend · `todo` — Build cohort overview and group summary

Alphabetical cards, dynamics counts, stage completion and competency average denominators; filters do not alter whole-cohort summary.

#### YWSLAB-61 · frontend · `todo` — Build student profile and stage history

16 scales, signed changes, selected-module columns, partial/empty states, common 0–10 charts and sticky labels on mobile.

### YWSLAB-34 · story · `dropped` — Audit and import existing student data

Audit existing student spreadsheets, map them to versioned CSV, dry-run validation and idempotent operator import; reconcile a real sample. Use documented manual entry if sheets are absent or unusable.

#### YWSLAB-62 · backend · `dropped` — Implement operator CSV dry-run and import

Versioned template, row validation, duplicate resolution and idempotent commit; no source files in repo or public upload route.

#### YWSLAB-63 · test · `dropped` — Reconcile imported cohort against source

Verify roster counts, selected modules and sampled scores with a methodologist; document manual-entry fallback if sheets unusable.

## YWSLAB-8 · epic · `todo` — Release validation and launch

Verify the complete 1.0 release, deploy it and provide operational guidance.

### YWSLAB-29 · story · `backlog` — Verify end-to-end user journeys

Test sign-in, plan ownership, methodologist progress access, persistence and failure/recovery paths against acceptance criteria.

Links: blocks YWSLAB-31

#### YWSLAB-64 · test · `todo` — Run release journey tests

Cover Telegram sign-in, private plans, public links, shared methodologist cohort, module edits, assessments, import and denied access.

### YWSLAB-30 · story · `backlog` — Review accessibility, security and performance

Check keyboard and screen reader flows, mobile layouts, authorization boundaries, privacy, input handling and expected data load.

Links: blocks YWSLAB-31

#### YWSLAB-65 · test · `todo` — Run accessibility, security and performance review

Check keyboard/screen reader/mobile, authorization/privacy, 200-exercise editor, 2000-pose search and 100-student cohort against spec targets.

### YWSLAB-31 · story · `backlog` — Deploy and document operations

Set up production deployment, backups, monitoring/error visibility, rollback path and operator guide; run final release acceptance.

#### YWSLAB-66 · backend · `todo` — Deploy, backup and prove rollback

Production config, migration, error monitoring, restricted backups, restore test, rollback rehearsal and operator runbook.

#### YWSLAB-68 · subtask · `todo` — Remove temporary design references before release

After final UI validation, remove the local references/ screenshots as requested; verify they were never committed or deployed. Keep the design audit and decisions in Tasksurf.
