import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "../scripts/migrate.mjs";
import * as schema from "../src/server/db/schema";
import { COMPETENCY_CODES } from "../src/server/progress/competencies";

const url = process.env.DATABASE_URL_TEST ?? "postgres://yws:yws@localhost:5432/yws_test";
process.env.DATABASE_URL = url;

// next/headers + next/navigation need a request scope; fake them for the page-level guards.
const cookieJar = { value: undefined as string | undefined };
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === "yws_session" && cookieJar.value ? { value: cookieJar.value } : undefined) }),
  headers: async () => new Headers({ "x-yws-path": "/progress" }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));

const sql = postgres(url, { max: 2, onnotice: () => {} });
const db = drizzle(sql, { schema });

const METH_TG = 888001n;
const TEACHER_TG = 888002n;
let actions: typeof import("../src/app/progress/actions");
let svc: typeof import("../src/server/progress/service");
let authSvc: typeof import("../src/server/auth/service");
let methToken = "";
let teacherToken = "";
let methId = "";
let cohortId = "";

const ident = (telegramId: bigint) => ({ telegramId, name: "it-ui", username: null, photoUrl: null, phone: null });
const full = (n: number) => Object.fromEntries(COMPETENCY_CODES.map((c) => [c, n]));

async function cleanup() {
  await sql`delete from enrollment where cohort_id in (select id from cohort where name like 'it-ui-%')`;
  await sql`delete from cohort where name like 'it-ui-%'`;
  await sql`delete from student where display_name like 'it-ui-%'`;
  await sql`delete from audit_event where actor_id in (select id from account where telegram_id in (${METH_TG.toString()}, ${TEACHER_TG.toString()}))`;
  await sql`delete from account where telegram_id in (${METH_TG.toString()}, ${TEACHER_TG.toString()})`;
}

beforeAll(async () => {
  await runMigrations(url);
  await cleanup();
  process.env.METHODOLOGIST_TELEGRAM_IDS = METH_TG.toString();
  authSvc = await import("../src/server/auth/service");
  actions = await import("../src/app/progress/actions");
  svc = await import("../src/server/progress/service");
  const m = await authSvc.signIn(db, ident(METH_TG));
  const t = await authSvc.signIn(db, ident(TEACHER_TG));
  methToken = m.token;
  methId = m.account.id;
  teacherToken = t.token;
  const c = await svc.createCohort({ name: `it-ui-${crypto.randomUUID().slice(0, 8)}`, modules: [1, 2] }, methId);
  if (!c.ok) throw new Error("cohort");
  cohortId = c.value.id;
});

afterAll(async () => {
  await cleanup();
  await sql.end();
  const g = globalThis as unknown as { __ywsSql?: postgres.Sql };
  await g.__ywsSql?.end();
});

beforeEach(() => {
  cookieJar.value = methToken;
});

describe("progress server actions: access", () => {
  it("answer 404 (notFound) for a signed-in non-methodologist, before touching data", async () => {
    cookieJar.value = teacherToken;
    const id = "00000000-0000-4000-8000-000000000000";
    const calls: Array<() => Promise<unknown>> = [
      () => actions.createCohortAction({ name: "it-ui-nope" }),
      () => actions.setModulesAction(cohortId, [1, 2, 3], 1),
      () => actions.searchStudentsAction("a"),
      () => actions.enrollAction({ cohortId, student: { newStudent: { displayName: "it-ui-nope" } }, startingProfile: "polishing" }),
      () => actions.setStartingProfileAction(cohortId, id, "reframing"),
      () => actions.archiveEnrollmentAction(cohortId, id),
      () => actions.restoreEnrollmentAction(cohortId, id),
      () => actions.getOverviewAction(cohortId),
      () => actions.getStageFormAction(cohortId, id, "point0"),
      () => actions.saveStageAction(cohortId, id, "point0", full(5), 0),
    ];
    for (const call of calls) await expect(call()).rejects.toThrow("NEXT_NOT_FOUND");
    const rows = await sql`select 1 from student where display_name = 'it-ui-nope'`;
    expect(rows).toHaveLength(0);
    const cohorts = await sql`select 1 from cohort where name = 'it-ui-nope'`;
    expect(cohorts).toHaveLength(0);
  });

  it("answer 404 for a signed-out caller", async () => {
    cookieJar.value = undefined;
    await expect(actions.getOverviewAction(cohortId)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("page routes guard with requireMethodologist as their first call", async () => {
    cookieJar.value = teacherToken;
    const { default: ProgressPage } = await import("../src/app/progress/page");
    const { default: CohortPage } = await import("../src/app/progress/cohorts/[id]/page");
    const { default: StudentPage } = await import("../src/app/progress/cohorts/[id]/students/[enrollmentId]/page");
    const { default: AssessPage } = await import("../src/app/progress/cohorts/[id]/students/[enrollmentId]/assess/[stage]/page");
    const { default: ModulesPage } = await import("../src/app/progress/cohorts/[id]/modules/page");
    const { default: EnrollPage } = await import("../src/app/progress/cohorts/[id]/enroll/page");
    const id = "00000000-0000-4000-8000-000000000000";
    await expect(ProgressPage({})).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(CohortPage({ params: Promise.resolve({ id: cohortId }) })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(StudentPage({ params: Promise.resolve({ id: cohortId, enrollmentId: id }) })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(AssessPage({ params: Promise.resolve({ id: cohortId, enrollmentId: id, stage: "point0" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(ModulesPage({ params: Promise.resolve({ id: cohortId }) })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(EnrollPage({ params: Promise.resolve({ id: cohortId }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("progress server actions: methodologist", () => {
  it("enrolls, saves a stage and returns the overview alphabetically (never by score)", async () => {
    // Enrolled out of order; the highest scorer is not first.
    const people: [string, number][] = [
      ["it-ui-Яна", 9],
      ["it-ui-Андрій", 2],
      ["it-ui-Олена", 5],
      ["it-ui-Богдан", 7],
    ];
    for (const [displayName, score] of people) {
      const r = await actions.enrollAction({ cohortId, student: { newStudent: { displayName } }, startingProfile: "reframing" });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const s = await actions.saveStageAction(cohortId, r.value.id, "point0", full(score), 0);
      expect(s.ok).toBe(true);
    }
    const o = await actions.getOverviewAction(cohortId);
    expect(o.ok).toBe(true);
    if (!o.ok) return;
    expect(o.value.cards.map((c) => c.displayName)).toEqual(["it-ui-Андрій", "it-ui-Богдан", "it-ui-Олена", "it-ui-Яна"]);
    expect(o.value.totalActive).toBe(4);

    // Filters narrow the cards only; the summary still covers the whole cohort.
    const f = await actions.getOverviewAction(cohortId, { startingProfile: "polishing" });
    expect(f.ok && f.value.cards).toEqual([]);
    expect(f.ok && f.value.summary.studentCount).toBe(4);
    expect(f.ok && f.value.summary.completeByStage.point0).toBe(4);
  });

  it("reports a duplicate enrollment and a stale stage version", async () => {
    const o = await actions.getOverviewAction(cohortId);
    if (!o.ok) throw new Error("overview");
    const first = o.value.cards[0]!;
    const dup = await actions.enrollAction({ cohortId, student: { studentId: first.studentId }, startingProfile: "polishing" });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.code).toBe("already_enrolled");
    const stale = await actions.saveStageAction(cohortId, first.enrollmentId, "point0", full(6), 0);
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe("stage_conflict");
  });

  it("id-only actions 404 when the enrollment belongs to another cohort", async () => {
    const o = await actions.getOverviewAction(cohortId);
    if (!o.ok) throw new Error("overview");
    const enr = o.value.cards[0]!.enrollmentId;
    const other = await svc.createCohort({ name: `it-ui-${crypto.randomUUID().slice(0, 8)}`, modules: [1] }, methId);
    if (!other.ok) throw new Error("cohort");
    await expect(actions.saveStageAction(other.value.id, enr, "point0", full(1), 0)).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(actions.getStageFormAction(other.value.id, enr, "point0")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(actions.archiveEnrollmentAction(other.value.id, enr)).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(actions.setStartingProfileAction(other.value.id, enr, "polishing")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(actions.getStageFormAction(cohortId, enr, "point0")).resolves.toMatchObject({ ok: true });
  });
});
