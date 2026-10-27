# YWS-Lab 1.0 — Training plan builder spec

- ID: f7b9e0ac-43b2-450e-919b-290a39e664ae
- Version: 1
- Updated: 2026-10-27T09:03:07.858953Z
- Linked tasks: None

---

# YWS-Lab 1.0 — Training plan builder specification

Status: adapted product specification, 27 October 2026. Source: [Papaya PAP-8](https://tasksurfing.app/?document=a204d9a0-1a0a-4b20-afff-499a5cdc5307). Shared identity/access rules: [YWS-Lab shared spec](https://tasksurfing.app/?document=247c49d2-5916-4848-8b94-4bab36ed3f1a).

## 1. Purpose and scope
Every signed-in account holder can assemble a yoga training plan, keep it in a private library, preview/print it, and optionally share a read-only link. No YWS-Lab course enrollment, student account, lesson booking or payment is needed. A plan belongs to its creator; other signed-in accounts cannot browse or edit it.

This spec keeps PAP-8's structured editor, curated pose catalog, autosave, library, share links and print view. It removes all Papaya lesson attachment, historical lesson snapshot, student-directory and confirmed-email behavior. An account can create a plan immediately after Telegram sign-in.

## 2. Data model and rules
A **plan** has an owner, title, optional description, ordered sections, version, create/update timestamps and optional active share token. A **section** has an optional title and ordered exercises. An **exercise** is either a catalog pose reference or a custom text entry; it has optional duration *or* breath count, plus an optional note. Plans are separate from course progress.

| Field | Rule |
|---|---|
| Plan title | Required, 1–120 characters; new plan starts as “Нова програма”. Blank edits are not saved. |
| Description | Optional, up to 1,000 characters. |
| Section title | Optional, up to 80 characters; blank displays as “Частина N”. |
| Custom exercise title | Required, 1–80 characters. |
| Duration | Optional, 5–1,800 seconds in increments of 5. |
| Breaths | Optional, integer 1–99. Setting duration clears breaths and vice versa. |
| Exercise note | Optional, up to 300 characters. |
| Limits | At least one section; at most 20 sections and 200 exercises per plan. No fixed limit on number of plans per account. |

Catalog poses may repeat within a plan. The library summary is “N вправ · M хв” plus “K за диханнями” when applicable. M sums only timed exercises, rounds to the nearest minute with half up, and is at least 1 when any timed exercise exists. Individual durations display without zero parts, for example “45 с”, “1 хв 30 с”, “2 хв”.

## 3. Plan editor
1. **New plan** immediately creates a plan with a default title and one empty section, then opens the editor.
2. The user edits title/description inline; adds sections; adds catalog poses by click or drag; adds a custom exercise; enters duration or breaths and notes.
3. The user can reorder exercises within/between sections and reorder sections by drag. Every drag action also has keyboard/touch-accessible **Move up/Move down** actions. Duplicate exercise places a copy immediately after the original.
4. Deleting an exercise needs no confirmation. Deleting a nonempty section confirms the count of exercises removed. The only remaining section cannot be deleted.
5. The “current section” is the last section the user interacted with; a catalog click appends there. On first open it is the first section. When that section is deleted, select the previous one, otherwise the next.
6. Reaching a limit disables the relevant add action with an explanatory message. Invalid fields show an inline error and do not block valid changes elsewhere.

### Catalog
The curated catalog is common to all accounts. Each active pose has an image when licensed, a stable code, localized name(s) and difficulty 1–6. The panel supports search by displayed name and difficulty filter; shows 60 at a time with **Show more**. The catalog is maintained by an operator/content process, not edited by users. Custom exercises have no image.

A pose removed from discovery remains in existing plans. If image rights are withdrawn, its image disappears in the editor, preview, shared page and print; the text name remains. A catalog entry must not be published until the school confirms rights for in-app display, shared pages and personal printing. A missing image never prevents reading a plan.

### Autosave and concurrency
There is no Save button. Every valid change queues an autosave; the UI shows saving, “Saved at …”, or a retry state. During a network outage, the current edit remains in the browser and retries when possible. Navigation with pending unsaved changes warns the user. The server uses a plan version/conditional update: a stale tab cannot overwrite a newer version. The stale tab reloads the latest plan and displays a conflict message; at most its last uncommitted change may be lost. Returning to a tab refetches the latest version. If another tab deleted the plan, editing stops and a clear return-to-library action appears.

## 4. Private library
List the account's plans by last change, newest first. Show title, exercise/time summary, last change time and whether a share link is active. Search by title; show 20 at a time with **Show more**. Empty library and no-search-results states have clear creation/reset actions.

Actions: open editor, preview, duplicate, manage link, delete. Duplication copies description/sections/exercises but creates a new owner-local plan with no share token; title becomes “{title} (копія)” and truncates the source part to fit 120 characters. Delete confirms and is irreversible in the UI. Deleting a plan revokes its active link. There are no lesson references to warn about.

## 5. Preview, sharing and print
Preview uses the same content renderer for the owner and public link. It shows title, description, sections, exercise names/images, duration or breaths, notes and summary. The owner gets Edit and Link actions; the public page has no editing controls. Browser print removes navigation and buttons and keeps section/exercise order readable. PDF saving uses the browser's print function.

A plan can have one active secret link. Creating a link requires at least one exercise. A user can copy or revoke it. A revoked or deleted plan returns a generic “Link no longer works” page; creating a new link produces a different token. The public link requires no account and shows the *current* plan. It contains no student/course information and does not reveal the owner's Telegram username, phone or internal ID. Display only an optional owner display name if the owner explicitly opts in; default is no owner identity.

Tokens must be high entropy, stored hashed, checked on each request, excluded from search indexing, analytics, access logs and referrers to third-party pages. Public responses are not served from shared caches. Revocation blocks new requests immediately; already downloaded/printed copies cannot be recalled. A guessed, revoked or nonexistent link gives the same outward response.

## 6. Ownership, privacy and reliability
All editor, library, duplicate, delete and link-management calls check plan owner on the server. Access to another user's plan by direct URL/API yields the same response as a missing plan. Anonymous access exists only through the active share token. Progress data never appears in a plan or its public page.

Plan saves and reorder operations are atomic. On failed save, preserve the edit on screen and explain retry status. Record creation/deletion/link issuance/revocation and save errors without logging share tokens or user-authored notes. Prefer idempotent retry for mutations.

## 7. UI and quality
- Responsive editor: catalog alongside plan on wide screens and as a bottom panel on narrow screens. On mobile, click-to-add and action-menu reordering are fully usable without drag.
- All controls work with keyboard and have visible focus. Images have text alternatives, errors and save status are announced, and meaning never depends on color alone. Target WCAG AA contrast.
- Preview/public page requires no horizontal scrolling at 375 px. Browser support: current Chrome, Safari, Firefox and Edge.
- Performance acceptance on the agreed test device/network: readable plan within 2 seconds for 200 exercises; local reorder feedback within 100 ms; catalog search p95 within 300 ms for 2,000 poses. Record test conditions with results.
- UI copy follows the shared spec. User-authored notes and custom exercise names are displayed as entered. Catalog names resolve by active locale with a defined fallback when a translation is absent.

## 8. Release 1.0 exclusions
No lesson attachment, student-specific assignment, attendance, payment, workout timer/audio, completion tracking, health-condition filters, shared school-wide plan library or editing another owner's plan. Future platform integration does not change current plan ownership.

## 9. Acceptance checklist
- [ ] New account signs in with Telegram, creates a plan and sees it on a later device/session.
- [ ] Title, sections, exercises, duration/breath exclusivity, notes and all limits behave as section 2; summary arithmetic matches examples.
- [ ] Catalog search/filter/add, custom exercise, duplicates and order changes work with pointer, touch and keyboard.
- [ ] Autosave shows status; temporary outage preserves edits; stale tab cannot overwrite a newer version; deleted-in-other-tab editor stops saving.
- [ ] Library search, pagination, duplicate and delete work only on the owner's plans.
- [ ] Empty plan cannot create a link; nonempty plan can create, copy and revoke one active link; old tokens stay invalid after regeneration/deletion.
- [ ] Public page works without sign-in but contains no private account, student or course data; print output is readable.
- [ ] Another signed-in user cannot read or mutate a private plan by URL/API.
- [ ] Image failure or revoked image rights leaves text readable in every view.
- [ ] Mobile and accessibility checks in section 7 pass.

## 10. Product assumptions recorded for 1.0
Catalog, share links and print are included because the product owner asked to carry over PAP-8. If a later scope decision removes them, update this spec and the Release 1.0 stories together before implementation. Catalog content and image rights must be supplied/cleared before launch; code alone cannot satisfy that acceptance item.

