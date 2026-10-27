# YWS-Lab 1.0 screen blueprints

- ID: 3f3b15ec-ebdd-4607-9814-1cb4e7c7f612
- Version: 1
- Updated: 2026-10-27T09:19:38.880547Z
- Linked tasks: None

---

# YWS-Lab 1.0 screen blueprints

Companion to [design system](https://tasksurfing.app/?document=f2f31bba-28c1-4a4e-a6fd-9cf7eab3bc9c). These layouts define information order and interactions; component styling comes from the design system.

## Route map
- `/login`: Telegram sign-in.
- `/plans`: private plan library.
- `/plans/new` and `/plans/:id/edit`: plan editor.
- `/plans/:id/preview`: owner preview/print.
- `/p/:token`: public read-only share page.
- `/progress`: methodologist-only cohort selector/overview.
- `/progress/cohorts/:id`: cohort dashboard and roster.
- `/progress/cohorts/:id/modules`: module selection.
- `/progress/cohorts/:id/students/:enrollmentId`: student progress.
- `/progress/cohorts/:id/students/:enrollmentId/assess/:stage`: assessment.
- `/progress/cohorts/:id/students/:enrollmentId/history`: stage table/charts.

Routes are illustrative; implementation may consolidate them if browser Back/Forward, deep links and access checks remain correct.

## Sign-in
Dark brand panel with selected red-wordmark logo and a soft violet/blue ambient glow. White content panel carries one headline, a short explanation and **Continue with Telegram**. Show provider failure, canceled authorization and retry without requesting Telegram phone codes in the app. On mobile, brand panel becomes a compact header.

## Private app shell
Dark left rail on desktop with selected logo, Training plans, conditional Student progress, and account/sign-out at bottom. White/soft-gray working canvas and a 72 px top bar. Mobile uses top title bar plus a compact navigation surface. The progress item is absent for regular accounts; server still denies direct routes.

## Plan library
Page title, one-line helper and **New plan** above a title search. Plan cards/rows show name, N exercises, estimated minutes, changed time and link status. Open is the primary row action; menu contains Preview, Duplicate, Link and Delete. Empty library has one creation CTA. Search zero-state preserves the query and offers Clear. Loading shows neutral placeholders, never sample user plans.

## Plan editor
Top: breadcrumb/Back, editable title, save status, Preview and Link. Desktop body: catalog search/filter/cards at left or right (320–360 px); plan content in the flexible column. Each section is a card with title, add-custom action and menu for move/delete. Exercise rows show name/image, duration or breaths, note and reorder/duplicate/remove actions. New section appears after existing sections. Mobile catalog opens as a bottom sheet; row controls remain reachable without drag. Unsaved network/conflict state remains visible near title and gives an action.

## Plan preview and public share
Readable document column with title/description, summary and ordered sections/exercises. Owner view has Edit and Print; public view has Print only. Shared page has no student/course/account metadata. Link dialog gives Create, Copy and Revoke; revoke confirmation explains that saved copies persist. Invalid/revoked token shows the same neutral end state.

## Cohort overview
Methodologist-only page. Header: YWS-Lab, cohort selector, status, **Manage modules**, **Add teacher-student**. Directly below: selected module chips in numeric order, with Point 0 and Final fixed around them. Group summary cards show dynamics counts, stage completion counts and competency averages with denominators. Filters for profile and dynamics sit above alphabetical student cards. Card: name, starting profile, latest complete level/stage, signed Point 0 gain, dynamics text/reason, two group scales; Assess is prominent. Empty cohort prompts first enrollment.

## Manage modules
One sheet/page for the shared cohort. Display selected modules and available numbers 1–12. Methodologist selects one or more available module numbers and confirms Add. Existing scored modules show count of affected assessments and cannot be removed; unscored modules can be removed after confirmation. Concurrent changes show a refresh prompt with latest selection. The real current cohort can use modules 1–5; later cohorts can select different subsets.

## Teacher-student enrollment
Search existing roster by name/contact. Select a person or create a new record with required name and optional contact/note. Select one of three starting profiles before Add. A duplicate cohort enrollment shows “Already in this cohort.” No account invitation or student role flow. After Add, open their progress page.

## Assessment form
Header pins student name, cohort and stage. Stage selector shows Point 0, selected modules and Final; locked stages have an explanation. Two competency groups list 9 and 7 rows. Each row has full label, prior score hint, 0–10 slider, linked numeric input and Clear. “K of 16 assessed” appears with Save/Cancel. At 375 px, rows stack; Save/Cancel stay reachable without covering the active field. Leave/switch with unsaved edits opens Save/Discard/Cancel. Conflict and network errors preserve the draft.

## Student progress and history
Progress header shows name, starting profile/edit, current stage, latest complete level, Point 0 gain and dynamics with reason. Two competency groups show all 16 scales, current score and signed changes. History has fixed left labels and columns for Point 0, selected modules and Final; empty future stages remain visible. Charts use identical 0–10 axes and accessible table values. Link back to cohort retains filters.

## Shared states and checks
- Loading, empty, no-filter-match, validation, offline/retry, stale-version, archived, unauthorized and missing-resource states are specified for every route.
- Unauthorized progress gives a non-disclosing response. Public share expiry never reveals the original plan title or owner.
- Desktop 1440 px, tablet 768 px and phone 375 px must be checked. Keyboard path and screen-reader order are part of each screen's acceptance, not a separate visual variant.

