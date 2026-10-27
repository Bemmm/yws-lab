import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../scripts/migrate.mjs";

const url = process.env.DATABASE_URL_TEST ?? "postgres://yws:yws@localhost:5432/yws_test";
const sql = postgres(url, { max: 2, onnotice: () => {} });

let enrollmentId: string;
let cohortId = "";
let studentId = "";

beforeAll(async () => {
  await runMigrations(url);
  const [c] = await sql`insert into cohort (name) values ('it-cohort') returning id`;
  const [s] = await sql`insert into student (display_name) values ('it-student') returning id`;
  cohortId = c!.id;
  studentId = s!.id;
  const [e] = await sql`insert into enrollment (cohort_id, student_id, starting_profile)
    values (${cohortId}, ${studentId}, 'from_zero') returning id`;
  enrollmentId = e!.id;
});

afterAll(async () => {
  // cascades: assessment_stage -> assessment_score
  if (enrollmentId) await sql`delete from enrollment where id = ${enrollmentId}`;
  if (studentId) await sql`delete from student where id = ${studentId}`;
  if (cohortId) await sql`delete from cohort where id = ${cohortId}`;
  await sql.end();
});

describe("schema constraints", () => {
  it("accepts score 0 and rejects 11 and -1", async () => {
    const [st] = await sql`insert into assessment_stage (enrollment_id, stage)
      values (${enrollmentId}, 'point0') returning id`;
    const stageId = st!.id;
    await sql`insert into assessment_score (stage_id, competency_code, score) values (${stageId}, 'confidence', 0)`;
    await expect(
      sql`insert into assessment_score (stage_id, competency_code, score) values (${stageId}, 'coordination', 11)`,
    ).rejects.toThrow(/assessment_score_range/);
    await expect(
      sql`insert into assessment_score (stage_id, competency_code, score) values (${stageId}, 'coordination', -1)`,
    ).rejects.toThrow(/assessment_score_range/);
    const rows = await sql`select score from assessment_score where stage_id = ${stageId}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.score).toBe(0);
  });

  it("restricts stage names", async () => {
    await sql`insert into assessment_stage (enrollment_id, stage) values (${enrollmentId}, 'm12')`;
    await expect(
      sql`insert into assessment_stage (enrollment_id, stage) values (${enrollmentId}, 'm13')`,
    ).rejects.toThrow(/assessment_stage_valid/);
  });

  it("blocks duplicate enrollment in one cohort", async () => {
    await expect(
      sql`insert into enrollment (cohort_id, student_id, starting_profile)
        values (${cohortId}, ${studentId}, 'polishing')`,
    ).rejects.toThrow(/enrollment_cohort_student_uniq/);
  });

  it("limits cohort modules to 1..12", async () => {
    await sql`insert into cohort_module (cohort_id, module_number) values (${cohortId}, 12)`;
    await expect(
      sql`insert into cohort_module (cohort_id, module_number) values (${cohortId}, 13)`,
    ).rejects.toThrow(/cohort_module_number_range/);
  });
});
