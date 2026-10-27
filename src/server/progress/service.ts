/**
 * Student-progress service (YWSLAB-55, -57, -59; specs/03-student-progress.md).
 *
 * AUTHORIZATION: nothing in here checks the caller's role. Every function assumes the
 * caller already verified the methodologist whitelist (the UI layer wraps these with
 * `requireMethodologist()`); `actorId` is the account id recorded in audit_event /
 * assessment_stage.updated_by. Never call these from a route that has not done that check.
 *
 * Expected domain failures are returned as `{ ok: false, error }` (typed `ProgressError`);
 * only unexpected faults (DB down, bugs) throw. Never log names, notes or scores.
 */
import { and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { ZodType } from "zod";
import { getDb } from "../db/client";
import {
  assessmentScore,
  assessmentStage,
  auditEvent,
  cohort,
  cohortModule,
  enrollment,
  student,
} from "../db/schema";
import {
  computeStudentProgress,
  moduleNumberOf,
  orderStages,
  scoredCount,
  stageAvailability,
  summarizeGroup,
  type DynamicsLabel,
  type GroupSummary,
  type StageAvailability,
  type StageId,
  type StageScores,
  type StudentProgress,
} from "./calc";
import { COMPETENCY_CODES, type CompetencyCode } from "./competencies";
import * as S from "./schemas";
import type { ScoreIssue } from "./schemas";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Exec = Db | Tx;

export type StartingProfile = "polishing" | "reframing" | "from_zero";
export type ScoreMap = Record<CompetencyCode, number | null>;

export type ProgressError =
  | { code: "invalid_input"; issues: { path: string; message: string }[] }
  | { code: "not_found"; entity: "cohort" | "student" | "enrollment" }
  | { code: "cohort_archived" }
  | { code: "enrollment_archived" }
  | { code: "version_conflict"; entity: "cohort"; currentVersion: number; currentModules: number[] }
  | { code: "stage_conflict"; currentVersion: number; currentScores: ScoreMap; currentNote: string | null }
  | { code: "module_has_scores"; affectedCount: number; modules: { moduleNumber: number; students: number; scores: number }[] }
  | { code: "already_enrolled"; enrollmentId: string; archived: boolean }
  | { code: "duplicate_contact"; existingStudentId: string }
  | { code: "invalid_scores"; issues: ScoreIssue[] }
  | { code: "stage_unavailable"; availability: Exclude<StageAvailability, { available: true }> };

export type Result<T> = { ok: true; value: T } | { ok: false; error: ProgressError };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T = never>(error: ProgressError): Result<T> => ({ ok: false, error });

/** Thrown inside a transaction to roll it back and surface a typed error. */
class Abort extends Error {
  constructor(readonly error: ProgressError) {
    super(error.code);
  }
}

async function tx<T>(fn: (t: Tx) => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await getDb().transaction(fn));
  } catch (e) {
    if (e instanceof Abort) return fail(e.error);
    throw e;
  }
}

function parse<T>(schema: ZodType<T>, input: unknown): Result<T> {
  const r = schema.safeParse(input);
  if (r.success) return ok(r.data);
  return fail({
    code: "invalid_input",
    issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  });
}

async function audit(t: Exec, actorId: string, action: string, entity: string, entityId: string, data?: unknown) {
  await t.insert(auditEvent).values({ actorId, action, entity, entityId, data: data ?? null });
}

const emptyScoreMap = (): ScoreMap => Object.fromEntries(COMPETENCY_CODES.map((c) => [c, null])) as ScoreMap;
const toScoreMap = (s: StageScores): ScoreMap => ({ ...emptyScoreMap(), ...s });

/* ------------------------------------------------------------------ cohorts */

export interface CohortSummary {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  status: "active" | "archived";
  version: number;
  modules: number[];
  activeEnrollments: number;
}

async function modulesOf(e: Exec, cohortId: string): Promise<number[]> {
  const rows = await e
    .select({ n: cohortModule.moduleNumber })
    .from(cohortModule)
    .where(eq(cohortModule.cohortId, cohortId))
    .orderBy(asc(cohortModule.moduleNumber));
  return rows.map((r) => r.n);
}

async function loadCohort(e: Exec, cohortId: string, lock = false) {
  const q = e.select().from(cohort).where(eq(cohort.id, cohortId));
  const [row] = await (lock ? q.for("update") : q);
  if (!row) throw new Abort({ code: "not_found", entity: "cohort" });
  return row;
}

function assertWritable(c: { status: string }) {
  if (c.status === "archived") throw new Abort({ code: "cohort_archived" });
}

async function cohortSummary(e: Exec, cohortId: string): Promise<CohortSummary> {
  const c = await loadCohort(e, cohortId);
  const [cnt] = await e
    .select({ n: sql<number>`count(*)::int` })
    .from(enrollment)
    .where(and(eq(enrollment.cohortId, cohortId), isNull(enrollment.archivedAt)));
  return {
    id: c.id,
    name: c.name,
    startDate: c.startDate,
    endDate: c.endDate,
    status: c.status,
    version: c.version,
    modules: await modulesOf(e, cohortId),
    activeEnrollments: cnt?.n ?? 0,
  };
}

export async function createCohort(input: unknown, actorId: string): Promise<Result<CohortSummary>> {
  const p = parse(S.createCohortSchema, input);
  if (!p.ok) return p;
  const { name, startDate, endDate, modules } = p.value;
  return tx(async (t) => {
    const [c] = await t
      .insert(cohort)
      .values({ name, startDate: startDate ?? null, endDate: endDate ?? null })
      .returning({ id: cohort.id });
    if (modules?.length) {
      await t.insert(cohortModule).values(modules.map((moduleNumber) => ({ cohortId: c!.id, moduleNumber })));
    }
    await audit(t, actorId, "cohort.create", "cohort", c!.id, { modules: modules ?? [] });
    return cohortSummary(t, c!.id);
  });
}

export async function updateCohort(input: unknown, actorId: string): Promise<Result<CohortSummary>> {
  const p = parse(S.updateCohortSchema, input);
  if (!p.ok) return p;
  const { cohortId, name, startDate, endDate } = p.value;
  return tx(async (t) => {
    assertWritable(await loadCohort(t, cohortId, true));
    const set: Partial<typeof cohort.$inferInsert> = { updatedAt: new Date() };
    if (name !== undefined) set.name = name;
    if (startDate !== undefined) set.startDate = startDate;
    if (endDate !== undefined) set.endDate = endDate;
    await t.update(cohort).set(set).where(eq(cohort.id, cohortId));
    await audit(t, actorId, "cohort.update", "cohort", cohortId, { fields: Object.keys(set).filter((k) => k !== "updatedAt") });
    return cohortSummary(t, cohortId);
  });
}

async function setCohortStatus(cohortId: string, status: "active" | "archived", actorId: string) {
  const p = parse(S.updateCohortSchema.pick({ cohortId: true }), { cohortId });
  if (!p.ok) return p;
  return tx(async (t) => {
    await loadCohort(t, cohortId, true);
    await t
      .update(cohort)
      .set({ status, version: sql`${cohort.version} + 1`, updatedAt: new Date() })
      .where(eq(cohort.id, cohortId));
    await audit(t, actorId, status === "archived" ? "cohort.archive" : "cohort.reopen", "cohort", cohortId);
    return cohortSummary(t, cohortId);
  });
}

/** Archived cohorts are read-only; history is preserved. */
export const archiveCohort = (cohortId: string, actorId: string) => setCohortStatus(cohortId, "archived", actorId);
/** Operator-only (spec section 2): the UI must not expose this to ordinary methodologists. */
export const reopenCohort = (cohortId: string, actorId: string) => setCohortStatus(cohortId, "active", actorId);

export async function listCohorts(input?: unknown): Promise<Result<CohortSummary[]>> {
  const p = parse(S.listCohortsSchema, input);
  if (!p.ok) return p;
  const db = getDb();
  const where = p.value?.status ? eq(cohort.status, p.value.status) : undefined;
  const rows = await db.select({ id: cohort.id }).from(cohort).where(where).orderBy(sql`${cohort.createdAt} desc`, asc(cohort.id));
  return ok(await Promise.all(rows.map((r) => cohortSummary(db, r.id))));
}

export async function getCohort(cohortId: string): Promise<Result<CohortSummary>> {
  const p = parse(S.updateCohortSchema.pick({ cohortId: true }), { cohortId });
  if (!p.ok) return p;
  return tx((t) => cohortSummary(t, cohortId));
}

/**
 * Sets the cohort's full module set (distinct 1-12). Adding never touches scores. Removing a
 * module that has any score is rejected (`module_has_scores`). Stale `expectedVersion` ->
 * `version_conflict` carrying the latest version and modules.
 */
export async function setModules(
  cohortId: string,
  modules: number[],
  expectedVersion: number,
  actorId: string,
): Promise<Result<CohortSummary>> {
  const p = parse(S.setModulesSchema, { cohortId, modules, expectedVersion });
  if (!p.ok) return p;
  return tx(async (t) => {
    const c = await loadCohort(t, cohortId, true);
    assertWritable(c);
    const current = await modulesOf(t, cohortId);
    if (c.version !== expectedVersion) {
      throw new Abort({ code: "version_conflict", entity: "cohort", currentVersion: c.version, currentModules: current });
    }
    const want = new Set(modules);
    const removed = current.filter((n) => !want.has(n));
    const added = [...want].filter((n) => !current.includes(n));
    if (removed.length === 0 && added.length === 0) return cohortSummary(t, cohortId);

    if (removed.length) {
      const rows = await t
        .select({
          stage: assessmentStage.stage,
          students: sql<number>`count(distinct ${assessmentStage.enrollmentId})::int`,
          scores: sql<number>`count(*)::int`,
        })
        .from(assessmentScore)
        .innerJoin(assessmentStage, eq(assessmentScore.stageId, assessmentStage.id))
        .innerJoin(enrollment, eq(assessmentStage.enrollmentId, enrollment.id))
        .where(and(eq(enrollment.cohortId, cohortId), inArray(assessmentStage.stage, removed.map((n) => `m${n}`))))
        .groupBy(assessmentStage.stage);
      if (rows.length) {
        throw new Abort({
          code: "module_has_scores",
          affectedCount: rows.reduce((a, r) => a + r.scores, 0),
          modules: rows
            .map((r) => ({ moduleNumber: moduleNumberOf(r.stage)!, students: r.students, scores: r.scores }))
            .sort((a, b) => a.moduleNumber - b.moduleNumber),
        });
      }
      await t
        .delete(cohortModule)
        .where(and(eq(cohortModule.cohortId, cohortId), inArray(cohortModule.moduleNumber, removed)));
    }
    if (added.length) {
      await t.insert(cohortModule).values(added.map((moduleNumber) => ({ cohortId, moduleNumber })));
    }
    await t
      .update(cohort)
      .set({ version: sql`${cohort.version} + 1`, updatedAt: new Date() })
      .where(eq(cohort.id, cohortId));
    await audit(t, actorId, "cohort.modules", "cohort", cohortId, { added, removed });
    return cohortSummary(t, cohortId);
  });
}

/* ----------------------------------------------------------------- students */

export interface StudentRecord {
  id: string;
  displayName: string;
  contact: string | null;
  note: string | null;
  archived: boolean;
}

const toStudent = (r: typeof student.$inferSelect): StudentRecord => ({
  id: r.id,
  displayName: r.displayName,
  contact: r.contact,
  note: r.note,
  archived: r.archivedAt !== null,
});

async function assertContactFree(t: Exec, contact: string | null | undefined, selfId?: string) {
  if (!contact) return;
  const [dup] = await t
    .select({ id: student.id })
    .from(student)
    .where(and(sql`lower(btrim(${student.contact})) = lower(btrim(${contact}))`, selfId ? ne(student.id, selfId) : undefined))
    .limit(1);
  if (dup) throw new Abort({ code: "duplicate_contact", existingStudentId: dup.id });
}

async function insertStudent(t: Exec, f: { displayName: string; contact?: string | null; note?: string | null }, actorId: string) {
  await assertContactFree(t, f.contact);
  const [row] = await t
    .insert(student)
    .values({ displayName: f.displayName, contact: f.contact ?? null, note: f.note ?? null })
    .returning();
  await audit(t, actorId, "student.create", "student", row!.id);
  return row!;
}

export async function createStudent(input: unknown, actorId: string): Promise<Result<StudentRecord>> {
  const p = parse(S.studentFieldsSchema, input);
  if (!p.ok) return p;
  return tx(async (t) => toStudent(await insertStudent(t, p.value, actorId)));
}

export async function updateStudent(input: unknown, actorId: string): Promise<Result<StudentRecord>> {
  const p = parse(S.updateStudentSchema, input);
  if (!p.ok) return p;
  const { studentId, displayName, contact, note } = p.value;
  return tx(async (t) => {
    const [cur] = await t.select().from(student).where(eq(student.id, studentId)).for("update");
    if (!cur) throw new Abort({ code: "not_found", entity: "student" });
    if (contact !== undefined) await assertContactFree(t, contact, studentId);
    const set: Partial<typeof student.$inferInsert> = { updatedAt: new Date() };
    if (displayName !== undefined) set.displayName = displayName;
    if (contact !== undefined) set.contact = contact;
    if (note !== undefined) set.note = note;
    const [row] = await t.update(student).set(set).where(eq(student.id, studentId)).returning();
    await audit(t, actorId, "student.update", "student", studentId, { fields: Object.keys(set).filter((k) => k !== "updatedAt") });
    return toStudent(row!);
  });
}

async function setStudentArchived(studentId: string, archived: boolean, actorId: string) {
  const p = parse(S.updateStudentSchema.pick({ studentId: true }), { studentId });
  if (!p.ok) return p;
  return tx(async (t) => {
    const [row] = await t
      .update(student)
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(eq(student.id, studentId))
      .returning();
    if (!row) throw new Abort({ code: "not_found", entity: "student" });
    await audit(t, actorId, archived ? "student.archive" : "student.unarchive", "student", studentId);
    return toStudent(row);
  });
}
/** Scores are preserved; the record just leaves default search lists and shows an "Archived" badge. */
export const archiveStudent = (studentId: string, actorId: string) => setStudentArchived(studentId, true, actorId);
export const unarchiveStudent = (studentId: string, actorId: string) => setStudentArchived(studentId, false, actorId);

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

/** Search by display name or contact (substring, case-insensitive). Alphabetical; archived hidden by default. */
export async function searchStudents(input?: unknown): Promise<Result<StudentRecord[]>> {
  const p = parse(S.searchStudentsSchema, input ?? {});
  if (!p.ok) return p;
  const { query, includeArchived, limit } = p.value;
  const pattern = query ? `%${likeEscape(query)}%` : null;
  const rows = await getDb()
    .select()
    .from(student)
    .where(
      and(
        includeArchived ? undefined : isNull(student.archivedAt),
        pattern ? or(sql`${student.displayName} ilike ${pattern}`, sql`${student.contact} ilike ${pattern}`) : undefined,
      ),
    )
    .limit(limit ?? 50);
  return ok(rows.map(toStudent).sort(byName));
}

const collator = new Intl.Collator(["uk", "ru", "en"], { sensitivity: "base", numeric: true });
/** Alphabetical by display name; ties by id so the order is deterministic. Never by score. */
const byName = (a: { id: string; displayName: string }, b: { id: string; displayName: string }) =>
  collator.compare(a.displayName, b.displayName) || a.id.localeCompare(b.id);

/* -------------------------------------------------------------- enrollments */

async function loadEnrollment(t: Exec, enrollmentId: string, lock = false) {
  const q = t
    .select({ e: enrollment, c: cohort })
    .from(enrollment)
    .innerJoin(cohort, eq(enrollment.cohortId, cohort.id))
    .where(eq(enrollment.id, enrollmentId));
  const [row] = await (lock ? q.for("update", { of: enrollment }) : q);
  if (!row) throw new Abort({ code: "not_found", entity: "enrollment" });
  return row;
}

export interface EnrollmentRecord {
  id: string;
  cohortId: string;
  studentId: string;
  startingProfile: StartingProfile;
  archived: boolean;
}
const toEnrollment = (e: typeof enrollment.$inferSelect): EnrollmentRecord => ({
  id: e.id,
  cohortId: e.cohortId,
  studentId: e.studentId,
  startingProfile: e.startingProfile,
  archived: e.archivedAt !== null,
});

/** Duplicate enrollment in one cohort (even an archived one) -> `already_enrolled`. */
export async function enroll(input: unknown, actorId: string): Promise<Result<EnrollmentRecord>> {
  const p = parse(S.enrollSchema, input);
  if (!p.ok) return p;
  const { cohortId, student: who, startingProfile } = p.value;
  return tx(async (t) => {
    assertWritable(await loadCohort(t, cohortId, true));
    let studentId: string;
    if ("studentId" in who) {
      const [s] = await t.select({ id: student.id }).from(student).where(eq(student.id, who.studentId));
      if (!s) throw new Abort({ code: "not_found", entity: "student" });
      studentId = s.id;
      const [dup] = await t
        .select()
        .from(enrollment)
        .where(and(eq(enrollment.cohortId, cohortId), eq(enrollment.studentId, studentId)));
      if (dup) throw new Abort({ code: "already_enrolled", enrollmentId: dup.id, archived: dup.archivedAt !== null });
    } else {
      studentId = (await insertStudent(t, who.newStudent, actorId)).id;
    }
    const [row] = await t.insert(enrollment).values({ cohortId, studentId, startingProfile }).returning();
    await audit(t, actorId, "enrollment.create", "enrollment", row!.id, { startingProfile });
    return toEnrollment(row!);
  });
}

export async function setStartingProfile(
  enrollmentId: string,
  startingProfile: StartingProfile,
  actorId: string,
): Promise<Result<EnrollmentRecord>> {
  const p = parse(S.setStartingProfileSchema, { enrollmentId, startingProfile });
  if (!p.ok) return p;
  return tx(async (t) => {
    const { e, c } = await loadEnrollment(t, enrollmentId, true);
    assertWritable(c);
    const [row] = await t.update(enrollment).set({ startingProfile }).where(eq(enrollment.id, e.id)).returning();
    await audit(t, actorId, "enrollment.profile", "enrollment", e.id, { from: e.startingProfile, to: startingProfile });
    return toEnrollment(row!);
  });
}

async function setEnrollmentArchived(enrollmentId: string, archived: boolean, actorId: string) {
  const p = parse(S.setStartingProfileSchema.pick({ enrollmentId: true }), { enrollmentId });
  if (!p.ok) return p;
  return tx(async (t) => {
    const { e, c } = await loadEnrollment(t, enrollmentId, true);
    assertWritable(c);
    const [row] = await t
      .update(enrollment)
      .set({ archivedAt: archived ? new Date() : null })
      .where(eq(enrollment.id, e.id))
      .returning();
    await audit(t, actorId, archived ? "enrollment.archive" : "enrollment.restore", "enrollment", e.id);
    return toEnrollment(row!);
  });
}
/** Archives the enrollment; scores are kept. */
export const archiveEnrollment = (id: string, actorId: string) => setEnrollmentArchived(id, true, actorId);
export const restoreEnrollment = (id: string, actorId: string) => setEnrollmentArchived(id, false, actorId);

/* -------------------------------------------------------------- assessments */

interface StageRow {
  version: number;
  note: string | null;
  scores: StageScores;
}

/** enrollmentId -> stage -> {version, scores}. Includes stage rows without scores. */
async function loadStages(e: Exec, enrollmentIds: string[]): Promise<Map<string, Record<StageId, StageRow>>> {
  const out = new Map<string, Record<StageId, StageRow>>(enrollmentIds.map((id) => [id, {}]));
  if (!enrollmentIds.length) return out;
  const rows = await e
    .select({
      enrollmentId: assessmentStage.enrollmentId,
      stage: assessmentStage.stage,
      version: assessmentStage.version,
      note: assessmentStage.note,
      code: assessmentScore.competencyCode,
      score: assessmentScore.score,
    })
    .from(assessmentStage)
    .leftJoin(assessmentScore, eq(assessmentScore.stageId, assessmentStage.id))
    .where(inArray(assessmentStage.enrollmentId, enrollmentIds));
  for (const r of rows) {
    const byStage = out.get(r.enrollmentId)!;
    const cur = (byStage[r.stage] ??= { version: r.version, note: r.note, scores: {} });
    if (r.code !== null && r.score !== null) (cur.scores as Record<string, number>)[r.code] = r.score;
  }
  return out;
}

const scoredMap = (stages: Record<StageId, StageRow>) =>
  Object.fromEntries(Object.entries(stages).map(([k, v]) => [k, scoredCount(v.scores)]));

export interface StageForm {
  enrollmentId: string;
  cohortId: string;
  stage: StageId;
  /** 0 when the stage has never been saved. Pass it back as `expectedVersion`. */
  version: number;
  scores: ScoreMap;
  /** Curator observation; null when empty. */
  note: string | null;
  scored: number;
  /** Nearest earlier scored value per competency, with the stage it came from. */
  previous: Record<CompetencyCode, { stage: StageId; score: number } | null>;
  availability: StageAvailability;
  /** Read-only because the cohort or enrollment is archived. */
  readOnly: boolean;
}

export async function getStageForm(enrollmentId: string, stage: string): Promise<Result<StageForm>> {
  const p = parse(S.saveStageSchema.pick({ enrollmentId: true, stage: true }), { enrollmentId, stage });
  if (!p.ok) return p;
  return tx(async (t) => {
    const { e, c } = await loadEnrollment(t, enrollmentId);
    const modules = await modulesOf(t, c.id);
    const stages = (await loadStages(t, [e.id])).get(e.id)!;
    const cur = stages[stage];
    const ordered = orderStages(modules);
    const idx = ordered.indexOf(stage);
    const previous = Object.fromEntries(
      COMPETENCY_CODES.map((code) => {
        for (let i = idx - 1; i >= 0 && idx > 0; i--) {
          const v = stages[ordered[i]!]?.scores[code];
          if (v !== undefined) return [code, { stage: ordered[i]!, score: v }];
        }
        return [code, null];
      }),
    ) as StageForm["previous"];
    return {
      enrollmentId: e.id,
      cohortId: c.id,
      stage,
      version: cur?.version ?? 0,
      scores: toScoreMap(cur?.scores ?? {}),
      note: cur?.note ?? null,
      scored: scoredCount(cur?.scores ?? {}),
      previous,
      availability: stageAvailability(modules, stage, scoredMap(stages)),
      readOnly: c.status === "archived" || e.archivedAt !== null,
    };
  });
}

export interface SaveStageResult {
  version: number;
  scores: ScoreMap;
  note: string | null;
  scored: number;
}

/**
 * Atomically replaces one stage's scores for one enrollment. `null` (or an omitted code)
 * means unassessed. Rejections: invalid_scores, stage_unavailable, cohort/enrollment archived,
 * and `stage_conflict` (stale version) which carries the latest saved scores. The audit event
 * keeps the previous values in `data` (database only; never logged).
 */
export async function saveStage(
  enrollmentId: string,
  stage: string,
  scores: Record<string, number | null>,
  note: string | null,
  expectedVersion: number,
  actorId: string,
): Promise<Result<SaveStageResult>> {
  const p = parse(S.saveStageSchema, { enrollmentId, stage, scores, note, expectedVersion, actorId });
  if (!p.ok) return p;
  const issues = S.validateScores(p.value.scores);
  if (issues.length) return fail({ code: "invalid_scores", issues });

  return tx(async (t) => {
    const { e } = await loadEnrollment(t, enrollmentId, true);
    // Lock the cohort row too, so a concurrent setModules can't remove a module this save writes to.
    const c = await loadCohort(t, e.cohortId, true);
    assertWritable(c);
    if (e.archivedAt) throw new Abort({ code: "enrollment_archived" });

    const modules = await modulesOf(t, c.id);
    const stages = (await loadStages(t, [e.id])).get(e.id)!;
    const availability = stageAvailability(modules, stage, scoredMap(stages));
    if (!availability.available) throw new Abort({ code: "stage_unavailable", availability });

    const conflict = async (): Promise<never> => {
      const latest = (await loadStages(t, [e.id])).get(e.id)![stage];
      throw new Abort({
        code: "stage_conflict",
        currentVersion: latest?.version ?? 0,
        currentScores: toScoreMap(latest?.scores ?? {}),
        currentNote: latest?.note ?? null,
      });
    };

    let stageId: string;
    let newVersion: number;
    const previous = stages[stage]?.scores ?? {};
    const previousNote = stages[stage]?.note ?? null;
    const nextNote = S.normalizeNote(p.value.note);
    if (!stages[stage]) {
      if (expectedVersion !== 0) return conflict();
      const [ins] = await t
        .insert(assessmentStage)
        .values({ enrollmentId: e.id, stage, note: nextNote, updatedBy: actorId })
        .onConflictDoNothing()
        .returning({ id: assessmentStage.id, version: assessmentStage.version });
      if (!ins) return conflict(); // lost a race with another first save
      stageId = ins.id;
      newVersion = ins.version;
    } else {
      const [row] = await t
        .select({ id: assessmentStage.id, version: assessmentStage.version })
        .from(assessmentStage)
        .where(and(eq(assessmentStage.enrollmentId, e.id), eq(assessmentStage.stage, stage)))
        .for("update");
      if (!row || row.version !== expectedVersion) return conflict();
      stageId = row.id;
      newVersion = row.version + 1;
      await t.update(assessmentStage).set({ version: newVersion, note: nextNote, updatedAt: new Date(), updatedBy: actorId }).where(eq(assessmentStage.id, stageId));
      await t.delete(assessmentScore).where(eq(assessmentScore.stageId, stageId));
    }

    const next: Record<string, number> = {};
    for (const [code, v] of Object.entries(p.value.scores)) if (v !== null) next[code] = v;
    const rows = Object.entries(next).map(([competencyCode, score]) => ({ stageId, competencyCode, score }));
    if (rows.length) await t.insert(assessmentScore).values(rows);

    await audit(t, actorId, "assessment.save", "enrollment", e.id, {
      stage,
      fromVersion: expectedVersion,
      toVersion: newVersion,
      previous,
      next,
      previousNote,
      nextNote,
    });
    return { version: newVersion, scores: toScoreMap(next), note: nextNote, scored: rows.length };
  });
}

/* ---------------------------------------------------------------- read models */

export type { DynamicsLabel };

export interface OverviewFilters {
  startingProfile?: StartingProfile;
  dynamics?: DynamicsLabel;
}

export interface OverviewCard {
  enrollmentId: string;
  studentId: string;
  displayName: string;
  studentArchived: boolean;
  startingProfile: StartingProfile;
  currentStage: StageId | null;
  currentStageScored: number;
  currentLevelStage: StageId | null;
  currentLevel: number | null;
  basicLevel: number | null;
  systemLevel: number | null;
  gainFromPoint0: number | null;
  dynamics: StudentProgress["dynamics"];
}

export interface CohortOverview {
  cohort: CohortSummary;
  /** Alphabetical by display name; filtered. */
  cards: OverviewCard[];
  /** Always the whole active cohort, regardless of filters. */
  summary: GroupSummary;
  totalActive: number;
}

export async function getCohortOverview(cohortId: string, filters?: unknown): Promise<Result<CohortOverview>> {
  const f = parse(S.overviewFiltersSchema, filters);
  if (!f.ok) return f;
  return tx(async (t) => {
    const summaryRow = await cohortSummary(t, cohortId);
    const rows = await t
      .select({ e: enrollment, s: student })
      .from(enrollment)
      .innerJoin(student, eq(enrollment.studentId, student.id))
      .where(and(eq(enrollment.cohortId, cohortId), isNull(enrollment.archivedAt)));
    const stages = await loadStages(t, rows.map((r) => r.e.id));
    const modules = summaryRow.modules;

    const items = rows
      .map((r) => ({
        r,
        prog: computeStudentProgress(
          modules,
          Object.fromEntries(Object.entries(stages.get(r.e.id)!).map(([k, v]) => [k, v.scores])),
        ),
      }))
      .sort((a, b) => byName({ id: a.r.e.id, displayName: a.r.s.displayName }, { id: b.r.e.id, displayName: b.r.s.displayName }));

    const visible = items.filter(
      (i) =>
        (!f.value?.startingProfile || i.r.e.startingProfile === f.value.startingProfile) &&
        (!f.value?.dynamics || i.prog.dynamics.label === f.value.dynamics),
    );

    return {
      cohort: summaryRow,
      cards: visible.map(({ r, prog }) => ({
        enrollmentId: r.e.id,
        studentId: r.s.id,
        displayName: r.s.displayName,
        studentArchived: r.s.archivedAt !== null,
        startingProfile: r.e.startingProfile,
        currentStage: prog.currentStage,
        currentStageScored: prog.currentStageScored,
        currentLevelStage: prog.currentLevelStage,
        currentLevel: prog.currentLevel,
        basicLevel: prog.currentBasicLevel,
        systemLevel: prog.currentSystemLevel,
        gainFromPoint0: prog.gainFromPoint0,
        dynamics: prog.dynamics,
      })),
      summary: summarizeGroup(items.map((i) => i.prog), modules),
      totalActive: items.length,
    };
  });
}

export interface StudentStageRow {
  stage: StageId;
  moduleNumber: number | null;
  version: number;
  scored: number;
  complete: boolean;
  level: number | null;
  basicLevel: number | null;
  systemLevel: number | null;
  scores: ScoreMap;
  /** Curator observation; null when empty. */
  note: string | null;
  availability: StageAvailability;
}

export interface StudentProgressView {
  enrollment: EnrollmentRecord;
  student: StudentRecord;
  cohort: { id: string; name: string; status: "active" | "archived"; modules: number[] };
  /** Point 0, modules ascending, Final: including empty future stages. */
  stages: StudentStageRow[];
  progress: StudentProgress;
}

export async function getStudentProgress(enrollmentId: string): Promise<Result<StudentProgressView>> {
  const p = parse(S.saveStageSchema.pick({ enrollmentId: true }), { enrollmentId });
  if (!p.ok) return p;
  return tx(async (t) => {
    const { e, c } = await loadEnrollment(t, enrollmentId);
    const [s] = await t.select().from(student).where(eq(student.id, e.studentId));
    const modules = await modulesOf(t, c.id);
    const stages = (await loadStages(t, [e.id])).get(e.id)!;
    const progress = computeStudentProgress(
      modules,
      Object.fromEntries(Object.entries(stages).map(([k, v]) => [k, v.scores])),
    );
    const counts = scoredMap(stages);
    return {
      enrollment: toEnrollment(e),
      student: toStudent(s!),
      cohort: { id: c.id, name: c.name, status: c.status, modules },
      stages: progress.stages.map((m) => ({
        stage: m.stage,
        moduleNumber: moduleNumberOf(m.stage),
        version: stages[m.stage]?.version ?? 0,
        scored: m.scored,
        complete: m.complete,
        level: m.level,
        basicLevel: m.basicLevel,
        systemLevel: m.systemLevel,
        scores: toScoreMap(stages[m.stage]?.scores ?? {}),
        note: stages[m.stage]?.note ?? null,
        availability: stageAvailability(modules, m.stage, counts),
      })),
      progress,
    };
  });
}

/** Archived enrollments of a cohort (alphabetical) so they can be opened and restored. No score data. */
export async function listArchivedEnrollments(
  cohortId: string,
): Promise<Result<{ enrollmentId: string; displayName: string }[]>> {
  const p = parse(S.updateCohortSchema.pick({ cohortId: true }), { cohortId });
  if (!p.ok) return p;
  const rows = await getDb()
    .select({ id: enrollment.id, displayName: student.displayName })
    .from(enrollment)
    .innerJoin(student, eq(enrollment.studentId, student.id))
    .where(and(eq(enrollment.cohortId, cohortId), sql`${enrollment.archivedAt} is not null`));
  return ok(rows.map((r) => ({ id: r.id, displayName: r.displayName })).sort(byName).map((r) => ({ enrollmentId: r.id, displayName: r.displayName })));
}

/** Per selected module: how many scores / students carry them (those modules cannot be removed). */
export async function moduleScoreCounts(
  cohortId: string,
): Promise<Result<{ moduleNumber: number; students: number; scores: number }[]>> {
  const p = parse(S.updateCohortSchema.pick({ cohortId: true }), { cohortId });
  if (!p.ok) return p;
  const rows = await getDb()
    .select({
      stage: assessmentStage.stage,
      students: sql<number>`count(distinct ${assessmentStage.enrollmentId})::int`,
      scores: sql<number>`count(*)::int`,
    })
    .from(assessmentScore)
    .innerJoin(assessmentStage, eq(assessmentScore.stageId, assessmentStage.id))
    .innerJoin(enrollment, eq(assessmentStage.enrollmentId, enrollment.id))
    .where(eq(enrollment.cohortId, cohortId))
    .groupBy(assessmentStage.stage);
  return ok(
    rows
      .filter((r) => moduleNumberOf(r.stage) !== null)
      .map((r) => ({ moduleNumber: moduleNumberOf(r.stage)!, students: r.students, scores: r.scores }))
      .sort((a, b) => a.moduleNumber - b.moduleNumber),
  );
}

/** Cohort an enrollment belongs to (for server-side ownership checks of id-only actions), or null. */
export async function enrollmentCohortId(enrollmentId: string): Promise<string | null> {
  if (!S.setStartingProfileSchema.shape.enrollmentId.safeParse(enrollmentId).success) return null;
  const [row] = await getDb().select({ c: enrollment.cohortId }).from(enrollment).where(eq(enrollment.id, enrollmentId));
  return row?.c ?? null;
}
