# YWS-Lab 1.0 — Student progress spec

- ID: 4b22c089-7e06-45ab-95cd-6953c9ca41e7
- Version: 3
- Updated: 2026-10-27T09:08:24.541068Z
- Linked tasks: None

---

# YWS-Lab 1.0 — Student progress specification

Status: adapted product specification, 27 October 2026. Source: [Papaya PAP-101](https://tasksurfing.app/?document=6deb0007-7868-412d-8e69-399d9fb26e9e). Shared identity/access rules: [YWS-Lab shared spec](https://tasksurfing.app/?document=247c49d2-5916-4848-8b94-4bab36ed3f1a).

## 1. Purpose and actors
Whitelisted YWS methodologists record each trainee's starting point and competency scores through the teacher-training course, then see that person's development and the whole cohort's progress. The product describes growth, not a ranking of students.

Only methodologists can view, create, change or export any progress record. Ordinary teachers may use the plan builder but have no course role. Teacher-students are roster records, not a login role. They have no progress-area access or account requirement in 1.0 and receive no automated assessment notifications.

## 2. Course, cohorts and stages
The course is **YWS-Lab**. Each cohort is a shared group of teacher-students taking this course. All whitelisted methodologists see and edit the same cohort, roster, modules and assessments; changes by one are visible to the others. A cohort starts with **Point 0** and **Final**; methodologists choose which numbered modules to add. The current real course has five modules and is in module 2, but no fixed five-module template is forced on a cohort. Point 0 is the entry assessment; Final is the exit assessment. Earlier assessments can be entered at any time without using the current date as a scoring rule.

A methodologist can create a cohort with a required name (1–80 characters), optional start/end dates and status Active/Archived. Under **Manage modules**, a methodologist adds one or several distinct module numbers from 1–12. The selected modules appear in numeric order between Point 0 and Final; for example, selecting 1, 2 and 4 yields **Point 0 → Module 1 → Module 2 → Module 4 → Final**. They can add more modules later without changing existing scores. An unscored module can be removed after confirmation; a module with any student's score cannot be removed until its assessments are cleared through the normal audited correction flow. Concurrent module edits use a cohort version so one methodologist cannot overwrite another's changes. Final is available only when at least one module is configured. Archiving makes the cohort read-only by default while preserving history; an authorized operator can reopen it. Cohort deletion is not a routine UI action. Separate cohorts never share scores, even when the same person is enrolled in both.

## 3. Student roster and starting profiles
Teacher-student records are native to YWS-Lab, separate from Papaya's student directory. Minimum fields: required display name (1–120 characters), optional contact identifier for deduplication, optional note visible only to methodologists, active/archived status. A Telegram account, email and phone are not required. A roster record is not an application role or login account. Search by name and available contact fields. A methodologist adds an existing teacher-student to the shared cohort or creates one during enrollment; duplicate enrollment in one cohort is blocked. The same student may join another cohort.

Each cohort enrollment has one required starting profile, editable later without recalculating scores:
- **Polishing (Огранка):** already teaches the YWS system; execution needs refinement.
- **Reframing (Перепрошивка):** teaches from prior experience outside the YWS system; needs to rebuild lesson structure.
- **From zero (С нуля):** not yet able to teach a class; skill starts from zero.

Archiving a student preserves assessments with an “Archived” badge and hides the record from the default add/search lists. Unarchiving restores it. Removing an enrollment archives that enrollment after confirmation; it does not erase scores. Permanent deletion of a student and all related assessments is an operator-only data request with an impact preview, audit event and backup/retention check. A name change updates the roster display without changing assessment history.

## 4. Competencies and assessment scale
The following 16 competencies are fixed for 1.0 and stored by stable codes, in this order. The school may later extend the catalog without changing existing score rows.

**Nine basic professional competencies:** speech and voice; relay function; confidence; audience contact; physical preparation; coordination; demonstration ability; sense of rhythm; movement plasticity.

**Seven YWS system competencies:** understanding and command of mode; command timing; command quality; group attention management; understanding exercise purpose; transitions; adherence to system principles.

UI labels and short labels follow the PAP-101 source names and are maintained in translation resources. The assessment value for each competency at each stage is either **unassessed** or an integer **0–10**. Zero is a real score. Each assessment row has editor and updated time. A stage can be partially assessed; the interface shows “K of 16 assessed.”

## 5. Methodologist workflow
1. Open **Student progress** and select the shared active cohort. The cohort overview shows the teacher-students and group summary.
2. In **Manage modules**, choose the module numbers this cohort tracks; add more later as needed. The selected modules define the assessment stages.
3. Add/find a teacher-student, enroll them in this cohort and select a starting profile. Existing paper records are entered manually (section 10).
4. Open a student's **Point 0** assessment, enter any subset of 16 scores and save. After each configured module, open its stage and enter scores. The Final stage is used at course exit.
5. Review student profile, latest full-stage level, change from Point 0, dynamics label, competency scales and stage history.
6. Review group summary. Filters help locate students without changing summary denominators.

Assessment form: stage selector; two competency groups; one slider and linked numeric input per competency; empty state means unassessed; **Clear** restores empty; previous available score is shown for context. Slider arrows change by 1; Home/End select 0/10. Counter shows “K of 16.” Actions: **Save** and **Cancel**.

Point 0 is always editable. A later configured stage becomes available after its immediately prior configured stage has at least one score; an unconfigured module has no stage. Final also requires at least one configured module. Already scored later stages remain editable if an earlier module is added or earlier scores are subsequently cleared; no silent deletion or automatic lock. Server validation enforces this rule for new stage entry. A methodologist may correct any scored stage; derived values recalculate.

Save all edits to one student's one stage atomically. The form holds changes locally until Save. Leaving, switching student or stage with unsaved edits asks Save / Discard / Cancel. An outage retains entered values and offers retry. Each stage has a version; a stale tab cannot overwrite newer scores. On conflict, show the latest saved stage and a conflict message; preserve the attempted edit long enough to inspect/copy before discard. A successful save confirms it.

## 6. Calculations
Calculate from stored integer scores; round **only for display** to one decimal. Never use rounded values to classify growth. A stage is **complete** only when all 16 competencies have scores. Levels and group-level dynamics use complete stages; a partial stage displays its K/16 count instead.

| Measure | Rule |
|---|---|
| Stage level | Arithmetic mean of all 16 scores on a complete stage, 0–10. |
| Basic level | Mean of the nine basic scores on a complete stage. |
| System level | Mean of the seven system scores on a complete stage. |
| Current level | Level of the latest complete stage. |
| Gain from Point 0 | Current level minus Point 0 level, only when Point 0 and a later stage are complete. |
| Current stage | Latest stage with at least one score, whether complete or partial. |
| Competency current value | Score from the latest stage where that competency has a score. |
| Competency change from Point 0 | Current value minus Point 0 score, when both exist. |
| Competency change from prior scored stage | Current value minus nearest earlier score for that competency. |

When a competency's latest score is its Point 0 score, it has no change from Point 0 (shown as —, not 0) and does not count towards the per-competency group mean gain. Show signed changes, including +, 0 and −. Use text and symbols as well as color. A student with no complete stage has no level; partial-stage scores still appear in the detailed history.

**Dynamics:** compare the last two complete stages; Δ is their unrounded level difference. Check rules in order:
1. If Point 0 is incomplete: “Point 0 incomplete.”
2. If only one stage is complete: “Only Point 0 so far.”
3. If Δ < 0, or any competency fell by **at least 2** between those two stages: **Attention**.
4. If 0 ≤ Δ < 0.3: **Stagnation**.
5. If 0.3 ≤ Δ < 1.5: **Steady growth**.
6. If Δ ≥ 1.5: **Rapid growth**.

For Attention, show a reason. If overall level fell, report that signed change. Otherwise name the first competency in the fixed order that fell by at least 2, with the number of additional such competencies. These thresholds are product constants. Missing competency scores cannot occur on either compared complete stage.

## 7. Cohort overview
The overview lists student cards alphabetically by display name, with starting profile, latest complete level and stage, Point 0 gain when available, dynamics label/reason and basic/system scales. Actions: Assess, Open progress, View history, Archive enrollment. Do not sort or rank by scores.

Above the cards, show group-wide counts by dynamics label; mean gain from Point 0 for each competency with its contributing student count; and number of complete assessments at every stage. Filters: starting profile and dynamics label. Filters change visible cards only; the group summary always uses the entire active cohort. Empty cohort and no-filter-match states include add/reset actions.

Cards and summary must not expose score data through public pages or regular-account APIs. The same cohort can be viewed by all currently whitelisted methodologists; an authorized change by one becomes visible to others.

## 8. Student progress and history
Visual language: "RPG skill progression, but not childish" (methodologists' brief, `specs/source/methodologists-brief-ru.md`). Every competency is a **skill bar** of 10 cells (filled cells = score, group colour: basic = teal, YWS system = violet), with `N/10` and two signed deltas underneath: change from Point 0 and change from the previous scored stage, e.g. `Режим ██████░░░░ 6/10 · +3 від точки 0 · +1 від минулого етапу`. Student cards on the cohort overview show the same bars in compact form (one per group = group level). Use the `SkillBar` and `DynamicsPill` components of the YWS Lab design system.

Student page: name, cohort and starting profile with Edit action; current stage, latest complete level, Point 0 gain and dynamics. Show two groups with nine/seven competency scales in fixed order. Each scale uses 0–10, a numeric value, and signed changes. Never rely on color alone. A never-scored competency shows “Unassessed.”

History shows Point 0, the cohort's selected modules in numeric order, and Final, including empty future stages. Rows: total level, group levels and all competencies. Partial-stage level cells show “K/16”; empty cells show an em dash. Competency mini-charts use a common 0–10 axis and only plot assessed stages. On a narrow screen the table can scroll horizontally while the names column stays visible.

## 9. Privacy, validation and quality
- Every read/write/export checks methodologist role on the server and cohort access. Direct URL/API access by another user gives a non-disclosing response. No student-facing notifications.
- Server rejects non-integer or out-of-range scores, unknown competency codes, invalid stage order and duplicate enrollment. All writes are transactional. An audit event records who changed which student's stage and when; previous values remain recoverable under the retention policy.
- General logs, analytics and error telemetry do not contain student names, contacts, notes or scores. Backups are access restricted and a restore is tested before launch.
- Keyboard operability, visible focus, screen-reader names, numeric labels and WCAG AA contrast are required. At 375 px cards/form stack in one column; history scrolls with sticky labels. At 768 px core screens have no page-wide horizontal scroll.
- Acceptance performance target: cohort overview readable within 2 seconds for 100 students with Point 0, five selected modules and Final populated on agreed test hardware/network. The data model supports up to 12 selected modules. Record test conditions and results. Pagination/virtualization may be used without changing calculations.
- Browser support: current Chrome, Safari, Firefox and Edge. UI copy follows the shared spec and numeric decimal separator follows active locale.

## 10. Initial data
There is no digital source: progress is kept on paper. 1.0 has no import. Before launch, methodologists enter the current cohort (roster, starting profiles, completed stages) manually through the normal UI; verify counts and a sample of records with a methodologist. Missing scores stay unassessed; zero remains zero.

## 11. Release 1.0 exclusions
No student self-service, non-methodologist teacher access to progress, student ranking, comparison between cohorts, automated scoring, attendance, assignments, lesson scheduling, payments, health data or Telegram notifications of scores.

## 12. Acceptance checklist
- [ ] Regular teacher account can use plans but cannot discover or access progress by navigation, URL or API; whitelist grant/revoke changes this immediately.
- [ ] A methodologist can create/select a shared cohort, choose any unique module numbers 1–12, add more later, and remove only unscored modules; another methodologist sees the changes.
- [ ] A methodologist can add an existing/new teacher-student to the cohort and set/change a starting profile; the same roster is shared by all whitelisted methodologists.
- [ ] Point 0, selected modules in numeric order, and Final appear; unselected modules do not. Stage entry rules and partial score behavior work.
- [ ] 0 is stored/displayed as a score; empty remains unassessed; invalid values are rejected by server.
- [ ] Save is atomic; leaving with unsaved changes prompts; network failure preserves entered data; stale tab cannot overwrite newer scores.
- [ ] Levels, gains, labels and Attention reasons match section 6, including exact boundary values 0.3, 1.5 and −2.
- [ ] Cohort summary counts and competency averages use all active enrollments independent of filters and expose contributing counts.
- [ ] Student page/history display missing and partial stages correctly on desktop and narrow screens.
- [ ] Archive retains historical scores; permanent deletion follows operator process and audit.
- [ ] Current cohort is entered manually and a methodologist confirms counts and sample scores against paper records.
- [ ] School methodologists validate a representative real cohort sample before go-live.

## 13. Assumptions to confirm during design/data review
The real course currently has five modules, but each cohort's tracked modules are chosen by a methodologist. The module-number range 1–12 is retained from PAP-101 as a product limit. Existing student data is on paper and is entered manually; there is no import in 1.0. The imported PAP-101 competency names, starting profiles and calculation thresholds are retained as product rules. Any requested change updates this document, tests and `plan/backlog.md` together.

