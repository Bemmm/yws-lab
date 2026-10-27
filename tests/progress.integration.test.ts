import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../scripts/migrate.mjs";
import { COMPETENCY_CODES } from "../src/server/progress/competencies";

const url = process.env.DATABASE_URL_TEST ?? "postgres://yws:yws@localhost:5432/yws_test";
process.env.DATABASE_URL = url; // the service reads it lazily on first use
const sql = postgres(url, { max: 2, onnotice: () => {} });

type Svc = typeof import("../src/server/progress/service");
let svc: Svc;
let actor = "";

const full = (n: number, over: Record<string, number | null> = {}) => ({
  ...Object.fromEntries(COMPETENCY_CODES.map((c) => [c, n])),
  ...over,
});

async function setup(modules: number[] = [1, 2]) {
  const c = await svc.createCohort({ name: `it-progress-${crypto.randomUUID().slice(0, 8)}`, modules }, actor);
  if (!c.ok) throw new Error("createCohort failed");
  return c.value;
}
async function enrolled(cohortId: string, name: string, profile = "polishing", contact?: string) {
  const r = await svc.enroll({ cohortId, student: { newStudent: { displayName: name, contact } }, startingProfile: profile }, actor);
  if (!r.ok) throw new Error(`enroll failed ${JSON.stringify(r.error)}`);
  return r.value;
}
const save = (e: string, stage: string, scores: Record<string, number | null>, v: number) =>
  svc.saveStage(e, stage, scores, v, actor);
function expectErr<T>(r: { ok: boolean; error?: unknown; value?: T }, code: string) {
  expect(r.ok).toBe(false);
  expect((r.error as { code: string }).code).toBe(code);
  return r.error as Record<string, unknown>;
}

beforeAll(async () => {
  await runMigrations(url);
  svc = await import("../src/server/progress/service");
  const [a] = await sql`insert into account (telegram_id, name) values (${Math.floor(Math.random() * 1e12)}, 'it-actor') returning id`;
  actor = a!.id;
});

afterAll(async () => {
  await sql`delete from audit_event where actor_id = ${actor}`;
  await sql`delete from enrollment where cohort_id in (select id from cohort where name like 'it-progress-%')`;
  await sql`delete from cohort where name like 'it-progress-%'`;
  await sql`delete from student where display_name like 'it-%'`;
  await sql`delete from account where id = ${actor}`;
  await sql.end();
});

describe("cohorts and modules", () => {
  it("creates with modules and enforces distinct 1-12", async () => {
    const c = await setup([4, 1]);
    expect(c.modules).toEqual([1, 4]);
    expect(c.version).toBe(1);
    expectErr(await svc.setModules(c.id, [1, 1], c.version, actor), "invalid_input");
    expectErr(await svc.setModules(c.id, [13], c.version, actor), "invalid_input");
    expectErr(await svc.setModules(c.id, [0], c.version, actor), "invalid_input");
  });

  it("adds modules, bumps version, stale version conflicts with latest state", async () => {
    const c = await setup([1]);
    const r = await svc.setModules(c.id, [1, 2, 3], c.version, actor);
    expect(r.ok && r.value.modules).toEqual([1, 2, 3]);
    expect(r.ok && r.value.version).toBe(2);
    const e = expectErr(await svc.setModules(c.id, [1], c.version, actor), "version_conflict");
    expect(e.currentVersion).toBe(2);
    expect(e.currentModules).toEqual([1, 2, 3]);
  });

  it("removes an unscored module but rejects removing a scored one with the affected count", async () => {
    const c = await setup([1, 2]);
    const a = await enrolled(c.id, "it-A");
    const b = await enrolled(c.id, "it-B");
    await save(a.id, "point0", full(5), 0);
    await save(a.id, "m1", { confidence: 4, coordination: 0 }, 0);
    await save(b.id, "point0", full(5), 0);
    await save(b.id, "m1", { confidence: 6 }, 0);

    const blocked = await svc.setModules(c.id, [2], 1, actor);
    const err = expectErr(blocked, "module_has_scores");
    expect(err.affectedCount).toBe(3);
    expect(err.modules).toEqual([{ moduleNumber: 1, students: 2, scores: 3 }]);

    const okRemove = await svc.setModules(c.id, [1], 1, actor);
    expect(okRemove.ok && okRemove.value.modules).toEqual([1]);
    // nothing changed on the failed attempt
    const g = await svc.getCohort(c.id);
    expect(g.ok && g.value.version).toBe(2);
  });

  it("archived cohort is read-only; reopen restores", async () => {
    const c = await setup([1]);
    const a = await enrolled(c.id, "it-Arch");
    await save(a.id, "point0", full(3), 0);
    const ar = await svc.archiveCohort(c.id, actor);
    expect(ar.ok && ar.value.status).toBe("archived");
    expectErr(await save(a.id, "point0", full(4), 1), "cohort_archived");
    expectErr(await svc.setModules(c.id, [1, 2], 2, actor), "cohort_archived");
    expectErr(await svc.updateCohort({ cohortId: c.id, name: "x" }, actor), "cohort_archived");
    const view = await svc.getStudentProgress(a.id); // history still readable
    expect(view.ok && view.value.progress.currentLevel).toBe(3);
    const re = await svc.reopenCohort(c.id, actor);
    expect(re.ok && re.value.status).toBe("active");
  });

  it("validates name length", async () => {
    expectErr(await svc.createCohort({ name: "" }, actor), "invalid_input");
    expectErr(await svc.createCohort({ name: "x".repeat(81) }, actor), "invalid_input");
  });
});

describe("students and enrollment", () => {
  it("blocks duplicate enrollment in a cohort, allows another cohort", async () => {
    const c1 = await setup();
    const c2 = await setup();
    const e = await enrolled(c1.id, "it-Dup");
    const again = await svc.enroll({ cohortId: c1.id, student: { studentId: e.studentId }, startingProfile: "from_zero" }, actor);
    const err = expectErr(again, "already_enrolled");
    expect(err.enrollmentId).toBe(e.id);
    const other = await svc.enroll({ cohortId: c2.id, student: { studentId: e.studentId }, startingProfile: "from_zero" }, actor);
    expect(other.ok).toBe(true);
    // archived enrollment still counts as duplicate (restore instead)
    await svc.archiveEnrollment(e.id, actor);
    const arch = expectErr(await svc.enroll({ cohortId: c1.id, student: { studentId: e.studentId }, startingProfile: "polishing" }, actor), "already_enrolled");
    expect(arch.archived).toBe(true);
  });

  it("dedupes by contact and searches by name/contact, hiding archived by default", async () => {
    const tag = crypto.randomUUID().slice(0, 6);
    const s = await svc.createStudent({ displayName: `it-Іванна ${tag}`, contact: `@Ivanna_${tag}` }, actor);
    expect(s.ok).toBe(true);
    const dup = expectErr(await svc.createStudent({ displayName: "it-other", contact: ` @ivanna_${tag} ` }, actor), "duplicate_contact");
    expect(dup.existingStudentId).toBe(s.ok && s.value.id);
    const byName = await svc.searchStudents({ query: `іванна ${tag}` });
    expect(byName.ok && byName.value).toHaveLength(1);
    const byContact = await svc.searchStudents({ query: `ivanna_${tag}` });
    expect(byContact.ok && byContact.value).toHaveLength(1);
    await svc.archiveStudent(s.ok ? s.value.id : "", actor);
    const hidden = await svc.searchStudents({ query: tag });
    expect(hidden.ok && hidden.value).toHaveLength(0);
    const shown = await svc.searchStudents({ query: tag, includeArchived: true });
    expect(shown.ok && shown.value[0]?.archived).toBe(true);
    const wild = await svc.searchStudents({ query: "%" });
    expect(wild.ok && wild.value.every((x) => x.displayName.includes("%") || (x.contact ?? "").includes("%"))).toBe(true);
  });

  it("changes the starting profile without touching scores; name change keeps history", async () => {
    const c = await setup();
    const e = await enrolled(c.id, "it-Prof", "polishing");
    await save(e.id, "point0", full(5), 0);
    const r = await svc.setStartingProfile(e.id, "reframing", actor);
    expect(r.ok && r.value.startingProfile).toBe("reframing");
    await svc.updateStudent({ studentId: e.studentId, displayName: "it-Prof Renamed" }, actor);
    const v = await svc.getStudentProgress(e.id);
    expect(v.ok && v.value.student.displayName).toBe("it-Prof Renamed");
    expect(v.ok && v.value.progress.currentLevel).toBe(5);
  });

  it("archiving an enrollment keeps scores but removes it from the overview and blocks writes", async () => {
    const c = await setup();
    const a = await enrolled(c.id, "it-Keep");
    const b = await enrolled(c.id, "it-Drop");
    await save(b.id, "point0", full(5), 0);
    await svc.archiveEnrollment(b.id, actor);
    const o = await svc.getCohortOverview(c.id);
    expect(o.ok && o.value.cards.map((x) => x.enrollmentId)).toEqual([a.id]);
    expect(o.ok && o.value.summary.studentCount).toBe(1);
    expectErr(await save(b.id, "point0", full(6), 1), "enrollment_archived");
    const v = await svc.getStudentProgress(b.id);
    expect(v.ok && v.value.progress.currentLevel).toBe(5);
  });
});

describe("assessments", () => {
  it("saves, versions and replaces atomically; null clears; zero is stored", async () => {
    const c = await setup();
    const e = await enrolled(c.id, "it-Save");
    const form0 = await svc.getStageForm(e.id, "point0");
    expect(form0.ok && form0.value.version).toBe(0);
    expect(form0.ok && form0.value.scored).toBe(0);

    const r1 = await save(e.id, "point0", { confidence: 0, coordination: 7, transitions: null }, 0);
    expect(r1.ok && r1.value.version).toBe(1);
    expect(r1.ok && r1.value.scored).toBe(2);
    const r2 = await save(e.id, "point0", { coordination: 8 }, 1);
    expect(r2.ok && r2.value.version).toBe(2);
    const form = await svc.getStageForm(e.id, "point0");
    expect(form.ok && form.value.scores.coordination).toBe(8);
    expect(form.ok && form.value.scores.confidence).toBeNull(); // replaced, not merged
    const rows = await sql`select count(*)::int n from assessment_score s join assessment_stage st on st.id = s.stage_id where st.enrollment_id = ${e.id}`;
    expect(rows[0]!.n).toBe(1);
  });

  it("rejects out-of-range, non-integer and unknown codes without changing anything", async () => {
    const c = await setup();
    const e = await enrolled(c.id, "it-Range");
    await save(e.id, "point0", { confidence: 5 }, 0);
    for (const bad of [11, -1, 5.5, Number.NaN]) {
      const err = expectErr(await save(e.id, "point0", { confidence: bad, coordination: 3 }, 1), bad !== bad ? "invalid_input" : "invalid_scores");
      if (bad === bad) expect((err.issues as { code: string }[])[0]!.code).toBe("invalid_score");
    }
    const unk = expectErr(await save(e.id, "point0", { telepathy: 3 }, 1), "invalid_scores");
    expect((unk.issues as { code: string }[])[0]!.code).toBe("unknown_competency");
    const form = await svc.getStageForm(e.id, "point0");
    expect(form.ok && form.value.version).toBe(1);
    expect(form.ok && form.value.scores.confidence).toBe(5);
    expect(form.ok && form.value.scores.coordination).toBeNull();
  });

  it("stale save returns a conflict with the latest values and does not overwrite", async () => {
    const c = await setup();
    const e = await enrolled(c.id, "it-Stale");
    await save(e.id, "point0", { confidence: 5 }, 0);
    await save(e.id, "point0", { confidence: 6 }, 1); // tab A
    const stale = expectErr(await save(e.id, "point0", { confidence: 1 }, 1), "stage_conflict"); // tab B
    expect(stale.currentVersion).toBe(2);
    expect((stale.currentScores as Record<string, number | null>).confidence).toBe(6);
    // first save with wrong expected version also conflicts
    const e2 = await enrolled(c.id, "it-Stale2");
    expectErr(await save(e2.id, "point0", { confidence: 1 }, 3), "stage_conflict");
    // two concurrent first saves: exactly one wins
    const e3 = await enrolled(c.id, "it-Race");
    const [x, y] = await Promise.all([save(e3.id, "point0", { confidence: 1 }, 0), save(e3.id, "point0", { confidence: 2 }, 0)]);
    expect([x.ok, y.ok].filter(Boolean)).toHaveLength(1);
  });

  it("enforces stage availability and gives an explanation", async () => {
    const c = await setup([1, 2]);
    const e = await enrolled(c.id, "it-Avail");
    const locked = expectErr(await save(e.id, "m1", { confidence: 5 }, 0), "stage_unavailable");
    expect(locked.availability).toEqual({ available: false, reason: "prior_unscored", requires: "point0" });
    const form = await svc.getStageForm(e.id, "m2");
    expect(form.ok && form.value.availability).toEqual({ available: false, reason: "prior_unscored", requires: "m1" });
    expectErr(await save(e.id, "m3", { confidence: 5 }, 0), "stage_unavailable"); // not configured
    expectErr(await save(e.id, "bogus", { confidence: 5 }, 0), "invalid_input");

    await save(e.id, "point0", { confidence: 5 }, 0);
    expect((await save(e.id, "m1", { confidence: 5 }, 0)).ok).toBe(true);
    expect((await save(e.id, "m2", { confidence: 5 }, 0)).ok).toBe(true);
    expect((await save(e.id, "final", { confidence: 5 }, 0)).ok).toBe(true); // prior configured stage (m2) scored
  });

  it("scored later stages stay editable after earlier scores are cleared; final needs a module", async () => {
    const c = await setup([1]);
    const e = await enrolled(c.id, "it-Clear");
    await save(e.id, "point0", { confidence: 5 }, 0);
    await save(e.id, "m1", { confidence: 6 }, 0);
    await save(e.id, "point0", { confidence: null }, 1); // clear Point 0
    expect((await save(e.id, "m1", { confidence: 7 }, 1)).ok).toBe(true);
    const bare = await setup([]);
    const f = await enrolled(bare.id, "it-NoMod");
    await save(f.id, "point0", { confidence: 5 }, 0);
    const err = expectErr(await save(f.id, "final", { confidence: 5 }, 0), "stage_unavailable");
    expect(err.availability).toEqual({ available: false, reason: "final_needs_module" });
  });

  it("form shows previous available score per competency and writes an audit event with previous values", async () => {
    const c = await setup([1, 2]);
    const e = await enrolled(c.id, "it-Prev");
    await save(e.id, "point0", { confidence: 3, coordination: 4 }, 0);
    await save(e.id, "m1", { confidence: 6 }, 0);
    const form = await svc.getStageForm(e.id, "m2");
    expect(form.ok && form.value.previous.confidence).toEqual({ stage: "m1", score: 6 });
    expect(form.ok && form.value.previous.coordination).toEqual({ stage: "point0", score: 4 });
    expect(form.ok && form.value.previous.transitions).toBeNull();
    await save(e.id, "m1", { confidence: 8 }, 1);
    const [ev] = await sql`select data, actor_id from audit_event where entity_id = ${e.id} and action = 'assessment.save' order by created_at desc, id limit 1`;
    expect(ev!.actor_id).toBe(actor);
    expect(ev!.data.stage).toBe("m1");
    expect(ev!.data.previous).toEqual({ confidence: 6 });
    expect(ev!.data.next).toEqual({ confidence: 8 });
  });
});

describe("read models", () => {
  it("isolates cohorts: the same student's scores never leak across cohorts", async () => {
    const c1 = await setup([1]);
    const c2 = await setup([1]);
    const e1 = await enrolled(c1.id, "it-Iso");
    const e2r = await svc.enroll({ cohortId: c2.id, student: { studentId: e1.studentId }, startingProfile: "from_zero" }, actor);
    const e2 = e2r.ok ? e2r.value : (() => { throw new Error("enroll"); })();
    await save(e1.id, "point0", full(9), 0);
    await save(e1.id, "m1", full(9), 0);
    const o2 = await svc.getCohortOverview(c2.id);
    expect(o2.ok && o2.value.cards[0]!.currentLevel).toBeNull();
    expect(o2.ok && o2.value.summary.completeByStage).toEqual({ point0: 0, m1: 0, final: 0 });
    const v2 = await svc.getStudentProgress(e2.id);
    expect(v2.ok && v2.value.progress.currentStage).toBeNull();
    const form2 = await svc.getStageForm(e2.id, "point0");
    expect(form2.ok && form2.value.scored).toBe(0);
    const o1 = await svc.getCohortOverview(c1.id);
    expect(o1.ok && o1.value.summary.completeByStage).toEqual({ point0: 1, m1: 1, final: 0 });
  });

  it("overview is alphabetical by name, never by score; filters hide cards but not the summary", async () => {
    const c = await setup([1]);
    const names = ["it-Zoya", "it-anna", "it-Борис", "it-Олена", "it-Марко"];
    const es: Record<string, Awaited<ReturnType<typeof enrolled>>> = {};
    for (const [i, n] of names.entries()) es[n] = await enrolled(c.id, n, i % 2 ? "reframing" : "polishing");
    // Zoya is the "best", Борис the "worst": order must not follow scores
    await save(es["it-Zoya"]!.id, "point0", full(2), 0);
    await save(es["it-Zoya"]!.id, "m1", full(9), 0);
    await save(es["it-Борис"]!.id, "point0", full(8), 0);
    await save(es["it-Борис"]!.id, "m1", full(2), 0);
    const o = await svc.getCohortOverview(c.id);
    expect(o.ok && o.value.cards.map((x) => x.displayName)).toEqual(["it-Борис", "it-Марко", "it-Олена", "it-anna", "it-Zoya"]); // uk collation: Cyrillic first, case-insensitive
    expect(o.ok && o.value.summary.dynamicsCounts).toMatchObject({ rapid: 1, attention: 1, point0_incomplete: 3 });
    expect(o.ok && o.value.cards.find((x) => x.displayName === "it-Борис")!.dynamics.reason).toEqual({ kind: "level_fall", delta: -6 });

    const f = await svc.getCohortOverview(c.id, { dynamics: "attention" });
    expect(f.ok && f.value.cards.map((x) => x.displayName)).toEqual(["it-Борис"]);
    expect(f.ok && f.value.summary).toEqual(o.ok && o.value.summary);
    const g = await svc.getCohortOverview(c.id, { startingProfile: "reframing" });
    expect(g.ok && g.value.cards.every((x) => x.startingProfile === "reframing")).toBe(true);
    expect(g.ok && g.value.totalActive).toBe(5);
    expect(g.ok && g.value.summary.studentCount).toBe(5);
  });

  it("student progress: ordered stage rows incl. empty future stages, K/16 partials, levels", async () => {
    const c = await setup([4, 1]);
    const e = await enrolled(c.id, "it-View");
    await save(e.id, "point0", full(4), 0);
    await save(e.id, "m1", { confidence: 9, coordination: 0 }, 0);
    const r = await svc.getStudentProgress(e.id);
    if (!r.ok) throw new Error("view");
    const v = r.value;
    expect(v.stages.map((s) => s.stage)).toEqual(["point0", "m1", "m4", "final"]);
    expect(v.stages.map((s) => [s.scored, s.complete, s.level])).toEqual([[16, true, 4], [2, false, null], [0, false, null], [0, false, null]]);
    expect(v.stages[0]!.version).toBe(1);
    expect(v.stages[2]!.version).toBe(0);
    expect(v.stages[1]!.scores.confidence).toBe(9);
    expect(v.stages[1]!.scores.transitions).toBeNull();
    expect(v.stages[2]!.availability).toEqual({ available: true }); // m1 has scores
    expect(v.stages[3]!.availability).toEqual({ available: false, reason: "prior_unscored", requires: "m4" });
    expect(v.progress.currentStage).toBe("m1");
    expect(v.progress.currentLevelStage).toBe("point0");
    expect(v.progress.dynamics.label).toBe("only_point0");
    expect(v.progress.competencies.find((x) => x.code === "coordination")!.changeFromPoint0).toBe(-4);
  });

  it("unknown ids give typed not_found", async () => {
    const id = crypto.randomUUID();
    expectErr(await svc.getStudentProgress(id), "not_found");
    expectErr(await svc.getCohortOverview(id), "not_found");
    expectErr(await svc.getStageForm(id, "point0"), "not_found");
    expectErr(await save(id, "point0", {}, 0), "not_found");
  });
});
