# Project brief and confirmed decisions

- ID: 7939670b-ced8-4c7a-8bf7-7ccac8ffe95d
- Version: 2
- Updated: 2026-10-27T09:04:45.075532Z
- Linked tasks: None

---

# YWS-Lab project brief

## Context
YWS Core sells yoga courses through yws-core.com. The school has teachers and methodologists. The YWS-Lab teacher training course is in module 2 of 5 and runs roughly 5–8 months. A separate custom platform is being tested to replace Wix; this app will remain separate initially and may integrate with that platform later.

## Confirmed scope
- Account holders can create training plans with a workout builder.
- Only whitelisted methodologists can view and update student course progress. Other teachers do not conduct this course.
- First version uses Telegram code sign-in only.
- Course progress has no database: methodologists keep it on paper. Data is entered manually; no import.
- Repository name: `yws-lab`.

## Existing source
- Papaya workout program specification: https://tasksurfing.app/?document=352b48ab-b5ab-4675-832f-26af11d701fe
- Reuse the relevant builder behavior after reviewing it against YWS-Lab requirements. Papaya-specific scheduling, student-sharing, and account dependencies need explicit decisions.

## Delivery approach
- Define specs and a design system before implementation; user will provide design references.
- Plan the full implementation in this Tasksurf project before coding.
- Orchestrator owns implementation decisions and PR review/approval; use agents as appropriate while conserving tokens.

## To define in specs
- Training plan builder scope and how it differs from Papaya's program feature.
- Student progress model, workflows, access rules, and spreadsheet migration.
- Telegram sign-in flow and account lifecycle.
- Integration boundary with the future custom platform.
- Design references, UI language, hosting, and release criteria.

## Specification status — 27 October 2026
The two module specs have been adapted for YWS-Lab. Current authoritative drafts: [builder](https://tasksurfing.app/?document=f7b9e0ac-43b2-450e-919b-290a39e664ae), [progress](https://tasksurfing.app/?document=4b22c089-7e06-45ab-95cd-6953c9ca41e7), and [shared access/data rules](https://tasksurfing.app/?document=247c49d2-5916-4848-8b94-4bab36ed3f1a). The Papaya imports remain provenance only.

