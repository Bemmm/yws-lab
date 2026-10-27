# Release 1.0 work plan

- ID: 0c9aa223-1531-4509-982c-6bb426b10cdb
- Version: 6
- Updated: 2026-10-27T09:23:10.153465Z
- Linked tasks: None

---

# Release 1.0 work plan

## Status
The YWS-Lab module and shared-access specs are adapted. Design system, screen blueprints, Release 1.0 decisions and engineering breakdown are documented. Implementation follows the linked specs and acceptance matrix.

## Work order
1. **Product specification and release scope** — adapted PAP-8 and PAP-101; Telegram sign-in, methodologist whitelist, data ownership, spreadsheet handling and standalone integration boundary are defined.
2. **Design system and UX** — reference audit, red-wordmark logo choice, tokens/components and responsive screen blueprints are documented.
3. **Foundation** — choose stack from the approved specs, establish environments/CI, implement Telegram sign-in, authorization, database and migrations.
4. **Workout builder** — plan library, editor, autosave/conflicts, and preview. Catalog, sharing and print behavior depend on the 1.0 scope decision.
5. **Student progress** — shared cohort/teacher-student roster, methodologist-selected module stages, 16-competency assessments across Point 0, selected modules and Final, calculations, student/group views, plus spreadsheet import.
6. **Release validation and launch** — end-to-end acceptance, accessibility, security/privacy, data checks, deployment, backups, monitoring and rollback.

## Release structure
- [Release 1.0](https://tasksurfing.app/?task=bb0aa386-5061-4c35-9d7a-078ff0eb361f) is the only planned release.
- Epics represent the six workstreams; stories represent user-visible or independently verifiable outcomes.
- Engineering subtasks are created under implementation stories with acceptance criteria and dependency links. The [Release 1.0 acceptance matrix](https://tasksurfing.app/?document=e20ad868-c5d9-4b4b-b3cb-cb4092c68d14) defines launch evidence.

## Product rules already confirmed
- Any account holder may use the workout builder.
- Only whitelisted methodologists may view and update student progress. They share the same cohort, selected modules and teacher-student roster; students have no app role.
- First version uses Telegram code sign-in only.
- The app remains separate from the future custom platform for this release.

## Release 1.0 scope decisions
- Include curated pose catalog, shareable links and print.
- Plan operator CSV import with dry-run; use manual entry if source sheets are absent or unusable.
- Use official Telegram OIDC authorization-code sign-in and a shared methodologist cohort/teacher-student roster. Methodologists choose module numbers per cohort. Production hosting and credentials are implementation inputs.

## Adopted backlog scope
Release 1.0 includes the curated pose catalog, shareable/printable plans and an operator import path. Source content rights and actual spreadsheet mapping are verified during their implementation stories.

## Adapted specs now available
- [Shared product and access](https://tasksurfing.app/?document=247c49d2-5916-4848-8b94-4bab36ed3f1a)
- [Training plan builder](https://tasksurfing.app/?document=f7b9e0ac-43b2-450e-919b-290a39e664ae)
- [Student progress](https://tasksurfing.app/?document=4b22c089-7e06-45ab-95cd-6953c9ca41e7)
These adapted documents supersede the Papaya imports for Release 1.0. They adopt catalog, share/print and an operator spreadsheet import path. The shared spec records Telegram OIDC and Ukrainian-first UI as explicit working assumptions; change them through a spec update if product direction differs.

## Design and launch documents
- [Reference audit and logo choice](https://tasksurfing.app/?document=2a768d86-e216-45ed-ba24-99de8fa48ddf)
- [Design system](https://tasksurfing.app/?document=f2f31bba-28c1-4a4e-a6fd-9cf7eab3bc9c)
- [Screen blueprints](https://tasksurfing.app/?document=3f3b15ec-ebdd-4607-9814-1cb4e7c7f612)
- [Release decisions and acceptance matrix](https://tasksurfing.app/?document=e20ad868-c5d9-4b4b-b3cb-cb4092c68d14)

