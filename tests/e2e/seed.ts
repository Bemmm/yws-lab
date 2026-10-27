import { randomBytes, randomUUID } from "node:crypto";
import { ASANAS } from "../../src/features/builder/asana-manifest";
import { newProgram, opAddSession, opSetSlot } from "../../src/features/builder/model";
import { COMPETENCIES } from "../../src/server/progress/competencies";
import { sql } from "./db";

/** A two-set plan with a few asanas, optionally shared. Written straight to the DB (the same shape createPlan stores). */
export async function seedPlan(ownerId: string, opts: { title: string; shared?: boolean }) {
  const id = randomUUID();
  let doc = newProgram(id, opts.title, "Сет 1");
  doc = opAddSession(doc, "Сет 2");
  const [s1, s2] = doc.sessions;
  [0, 1, 2].forEach((i) => (doc = opSetSlot(doc, s1!.id, i, ASANAS[i]!)));
  [3, 4].forEach((i, j) => (doc = opSetSlot(doc, s2!.id, j, ASANAS[i]!)));
  const token = opts.shared ? randomBytes(24).toString("base64url") : null;
  const db = sql();
  await db`
    insert into plan (id, owner_id, title, document, share_token, share_enabled_at)
    values (${id}, ${ownerId}, ${opts.title}, ${db.json(JSON.parse(JSON.stringify(doc)))}, ${token}, ${token ? new Date() : null})`;
  return { id, token };
}

/** A cohort with modules 1-2, one student, and complete Point 0 + Module 1 assessments (a zero included). */
export async function seedCohort(name: string, studentName: string) {
  const db = sql();
  const [c] = await db<{ id: string }[]>`insert into cohort (name) values (${name}) returning id`;
  await db`insert into cohort_module (cohort_id, module_number) values (${c!.id}, 1), (${c!.id}, 2)`;
  const [s] = await db<{ id: string }[]>`insert into student (display_name) values (${studentName}) returning id`;
  const [e] = await db<{ id: string }[]>`
    insert into enrollment (cohort_id, student_id, starting_profile) values (${c!.id}, ${s!.id}, 'reframing') returning id`;
  for (const [stage, base] of [["point0", 3], ["m1", 5]] as const) {
    const [st] = await db<{ id: string }[]>`
      insert into assessment_stage (enrollment_id, stage) values (${e!.id}, ${stage}) returning id`;
    for (const [i, comp] of COMPETENCIES.entries()) {
      const score = stage === "point0" && i === 0 ? 0 : base;
      await db`insert into assessment_score (stage_id, competency_code, score) values (${st!.id}, ${comp.code}, ${score})`;
    }
  }
  return { cohortId: c!.id, enrollmentId: e!.id };
}
