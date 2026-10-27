# YWS-Lab — Platform integration boundary

Status: design note for 1.0, 27 October 2026. Linked tasks: YWSLAB-20 (story), YWSLAB-43 (analysis).

This note records what YWS-Lab owns, what it does not share in 1.0, and how a future read-only integration with the custom YWS platform would work. Nothing here is built in 1.0 and no part of 1.0 depends on the platform.

## 1. What YWS-Lab owns

| Area | Entities (schema) | Notes |
|---|---|---|
| Accounts | `account` | Keyed by Telegram subject (`telegram_id`, bigint). Internal key is `account.id` (uuid). |
| Plans | `plan` | Owned by one account. Private unless a share token is enabled. |
| Cohorts | `cohort`, `cohort_module` | Modules 1–12 selectable per cohort. |
| Roster | `student` | Teacher-students. No login, no account link. |
| Enrollments | `enrollment` | Student × cohort × starting profile. Unique per pair. |
| Assessments | `assessment_stage`, `assessment_score` | Stage `point0`, `m1`…`m12`, `final`. Scores integer 0–10. Missing row = unassessed. |
| Audit | `audit_event` | Role grants, assessment changes, student deletion. Internal only. |

## 2. What YWS-Lab will not share in 1.0

- No API, webhook or export endpoint in 1.0. Data leaves only through operator-run backups.
- Plans and share tokens are never shared (owner content). Roster, enrollments and assessments go only to methodologist-authorized systems (§7).
- Telegram IDs, phones, usernames, photo URLs, sessions and audit events are never exported.
- No platform account is created from YWS-Lab data in 1.0.

## 3. Identity model

Three identifiers stay separate:

| Identifier | Owner | Stability | Used for |
|---|---|---|---|
| `account.id` (uuid) | YWS-Lab | Permanent, generated once | Internal foreign keys, export `account_id`, audit `actor_id` |
| Telegram subject (`account.telegram_id`) | Telegram | Permanent per Telegram user | Account key at sign-in; the only identity used for mapping |
| Platform user id (opaque text) | YWS platform | Set by the platform | Future integration only |

Rules:

- The Telegram subject is the join key between YWS-Lab and Telegram. `username`, `name` and `phone` are mutable profile fields and are never used for matching.
- The platform user id is stored as an opaque string. Neither side parses it.
- Roster students have no Telegram subject. Mapping them to platform learners, if ever needed, is a separate decision.

### Mapping table (added when the integration is built, not in 1.0)

```
platform_identity_link
  account_id          uuid     not null  references account(id)
  telegram_subject    bigint   not null  unique
  platform_user_id    text     not null  unique
  method              text     not null  -- 'telegram_subject' | 'manual_confirmed'
  linked_by           uuid     null      -- account id of the methodologist who confirmed, if manual
  linked_at           timestamptz not null default now()
  unlinked_at         timestamptz null
```

- A link is created only when the platform proves the same Telegram subject, or when a methodologist confirms the pairing manually. Both cases write an `audit_event`.
- **Never merge by name.** Two accounts with the same display name are not the same person. Name matching may suggest a candidate for manual review, nothing more.
- Unlinking sets `unlinked_at`; it never deletes history. YWS-Lab holds the table because it already holds Telegram subjects.

## 4. Export format

One JSON document per entity. Each file is a versioned envelope:

```json
{
  "schema": "yws-lab.export/1",
  "exported_at": "2026-11-03T08:00:00Z",
  "entity": "enrollment",
  "records": [
    {
      "id": "7f0c2a1e-3b7d-4c1e-9a52-2f1e6d0b9a11",
      "student_id": "…",
      "starting_profile": "from_zero",
      "created_at": "2026-09-01T12:30:00Z"
    }
  ]
}
```

Rules:

- **Stable ids.** Every record carries its uuid `id` exactly as stored. Ids are never reissued, even after archive.
- **Timestamps** are UTC, ISO 8601 with `Z`. Display timezone (Europe/Kyiv by default) is a UI concern and is not exported.
- **Competency codes** are the stable strings from `src/server/progress/competencies.ts` (for example `speech_voice`, `mode_command`). They are never renumbered or localised. Basic group: 9 codes. System group: 7 codes.
- **Scores.** An assessment is exported as one record per stage with all 16 competency codes present. Unassessed codes are `null`, not absent, so the shape is fixed. Scores are integers 0–10.
- **Entities:** `account` (identity fields only), `cohort`, `cohort_module`, `student`, `enrollment`, `assessment_stage` (with a `scores` object). `audit_event` only if needed (open question 3).
- **Pagination.** At most 500 records per page, ordered by `id`. Raw scores only; no rankings.

## 5. API sketch (future, read-only)

Not implemented; fixes the contract shape.

```
GET /api/integration/v1/accounts?cursor=…            identity fields + telegram_subject
GET /api/integration/v1/cohorts                       cohorts with selected modules
GET /api/integration/v1/cohorts/{cohortId}/enrollments
GET /api/integration/v1/cohorts/{cohortId}/assessments?stage=m3
```

- **Read-only.** Only `GET`.
- **Auth.** A named, hashed, rotatable service credential, never a user session or Telegram login.
- **Authorization.** The credential must map to a methodologist-authorized integration. Missing or unauthorized access returns the same non-disclosing `404` as a missing resource.
- **Response.** Same envelope as §4. Opaque `cursor` pagination. `ETag` per page.
- **Limits and audit.** Rate limited per credential, `Cache-Control: no-store`. Each student-data read writes an `audit_event` (credential, entity, count only). Breaking changes need `/v2`.

## 6. Migration boundary

- Neither database connects to the other. Any initial load uses the §4 export files, not a dump.
- Nothing here changes the 1.0 schema. The mapping table arrives later as an additive migration.

## 7. Privacy constraints

- Student names, contacts, notes, scores and assessment history go only to systems a methodologist has explicitly authorized. Each authorization is recorded with actor and timestamp.
- Teacher-students are not platform accounts, and the platform gets no student data by default.
- Exports go to access-restricted storage, never to logs, tickets or chat.
- A deleted student (see `specs/03-student-progress.md`) disappears from future exports at once. Copies already exported fall under the recipient's retention rules.

## 8. Open questions

1. Confirm that the Telegram OIDC `sub` equals the numeric Telegram user id in practice. The schema assumes it.
2. The spec lists "assessment revision" as an entity, but the schema keeps only a `version` counter on `assessment_stage`. Decide before the first export whether revision history is exported.
3. Decide whether `audit_event` is ever exported, or stays internal.
