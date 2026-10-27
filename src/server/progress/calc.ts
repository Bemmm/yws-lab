/**
 * Pure progress calculations (specs/03-student-progress.md section 6). No DB, no I/O.
 *
 * All maths runs on the stored integer scores. Nothing here rounds except
 * `roundOneDecimal` / `formatSignedOneDecimal`, which are display helpers and must
 * never feed a classification. Means over 16 scores have a power-of-two denominator,
 * so the level difference used for the 0.3 / 1.5 thresholds is computed exactly.
 */
import { COMPETENCIES, COMPETENCY_CODES, type CompetencyCode, type CompetencyGroup } from "./competencies";

export type StageId = string; // "point0" | "m1".."m12" | "final"
export type StageScores = Readonly<Partial<Record<CompetencyCode, number>>>;

export const POINT0: StageId = "point0";
export const FINAL: StageId = "final";
export const TOTAL_COMPETENCIES = COMPETENCY_CODES.length; // 16

/** Dynamics thresholds are product constants. */
export const STAGNATION_BELOW = 0.3;
export const RAPID_FROM = 1.5;
export const COMPETENCY_FALL_ATTENTION = 2;

const BASIC_CODES = COMPETENCIES.filter((c) => c.group === "basic").map((c) => c.code);
const SYSTEM_CODES = COMPETENCIES.filter((c) => c.group === "system").map((c) => c.code);

export function moduleStage(n: number): StageId {
  return `m${n}`;
}

/** Module number for "m1".."m12", otherwise null. */
export function moduleNumberOf(stage: StageId): number | null {
  const m = /^m([1-9]|1[0-2])$/.exec(stage);
  return m ? Number(m[1]) : null;
}

export function isValidStageId(stage: string): boolean {
  return stage === POINT0 || stage === FINAL || moduleNumberOf(stage) !== null;
}

/** Point 0, the selected modules ascending (numeric, de-duplicated), then Final. */
export function orderStages(modules: readonly number[]): StageId[] {
  const unique = [...new Set(modules)].filter((n) => Number.isInteger(n) && n >= 1 && n <= 12).sort((a, b) => a - b);
  return [POINT0, ...unique.map(moduleStage), FINAL];
}

export function scoredCount(scores: StageScores): number {
  return COMPETENCY_CODES.filter((c) => scores[c] !== undefined).length;
}

export function isComplete(scores: StageScores): boolean {
  return scoredCount(scores) === TOTAL_COMPETENCIES;
}

function sum(scores: StageScores, codes: readonly CompetencyCode[]): number {
  let s = 0;
  for (const c of codes) s += scores[c] ?? 0;
  return s;
}

export interface StageMetrics {
  stage: StageId;
  scored: number;
  complete: boolean;
  /** null unless the stage is complete (partial stages show K/16 instead). */
  level: number | null;
  basicLevel: number | null;
  systemLevel: number | null;
}

export function stageMetrics(stage: StageId, scores: StageScores): StageMetrics {
  const scored = scoredCount(scores);
  const complete = scored === TOTAL_COMPETENCIES;
  return {
    stage,
    scored,
    complete,
    level: complete ? sum(scores, COMPETENCY_CODES) / TOTAL_COMPETENCIES : null,
    basicLevel: complete ? sum(scores, BASIC_CODES) / BASIC_CODES.length : null,
    systemLevel: complete ? sum(scores, SYSTEM_CODES) / SYSTEM_CODES.length : null,
  };
}

export type DynamicsLabel = "point0_incomplete" | "only_point0" | "attention" | "stagnation" | "steady" | "rapid";

export type AttentionReason =
  | { kind: "level_fall"; delta: number }
  | { kind: "competency_fall"; code: CompetencyCode; fall: number; others: number };

export interface Dynamics {
  label: DynamicsLabel;
  /** Unrounded level difference of the last two complete stages; null for the two "no comparison" labels. */
  delta: number | null;
  from: StageId | null;
  to: StageId | null;
  reason: AttentionReason | null;
}

/** Classify a level difference (rules 4-6). Uses the raw number, never a rounded one. */
export function classifyDelta(delta: number): "stagnation" | "steady" | "rapid" | "attention" {
  if (delta < 0) return "attention";
  if (delta < STAGNATION_BELOW) return "stagnation";
  if (delta < RAPID_FROM) return "steady";
  return "rapid";
}

const NO_COMPARISON = (label: "point0_incomplete" | "only_point0"): Dynamics => ({
  label,
  delta: null,
  from: null,
  to: null,
  reason: null,
});

/** `stages` must be in stage order (see orderStages). Rules are checked in the spec's order. */
export function computeDynamics(stages: readonly { stage: StageId; scores: StageScores }[]): Dynamics {
  const p0 = stages.find((s) => s.stage === POINT0);
  if (!p0 || !isComplete(p0.scores)) return NO_COMPARISON("point0_incomplete");
  const complete = stages.filter((s) => isComplete(s.scores));
  if (complete.length < 2) return NO_COMPARISON("only_point0");

  const prev = complete[complete.length - 2]!;
  const curr = complete[complete.length - 1]!;
  const delta = stageMetrics(curr.stage, curr.scores).level! - stageMetrics(prev.stage, prev.scores).level!;

  const fallen = COMPETENCY_CODES.filter(
    (c) => (prev.scores[c] as number) - (curr.scores[c] as number) >= COMPETENCY_FALL_ATTENTION,
  );
  const base = { delta, from: prev.stage, to: curr.stage };

  if (delta < 0) return { ...base, label: "attention", reason: { kind: "level_fall", delta } };
  if (fallen.length > 0) {
    const first = fallen[0]!;
    return {
      ...base,
      label: "attention",
      reason: {
        kind: "competency_fall",
        code: first,
        fall: (prev.scores[first] as number) - (curr.scores[first] as number),
        others: fallen.length - 1,
      },
    };
  }
  return { ...base, label: classifyDelta(delta) as "stagnation" | "steady" | "rapid", reason: null };
}

export interface CompetencyProgress {
  code: CompetencyCode;
  group: CompetencyGroup;
  /** Latest stage where this competency has a score. */
  currentStage: StageId | null;
  currentValue: number | null;
  point0Value: number | null;
  /** current - Point 0; null when either is missing or the current value is the Point 0 score itself. */
  changeFromPoint0: number | null;
  priorStage: StageId | null;
  priorValue: number | null;
  /** current - nearest earlier score for the competency. */
  changeFromPrior: number | null;
}

export interface StudentProgress {
  stages: StageMetrics[];
  currentStage: StageId | null;
  currentStageScored: number;
  currentLevelStage: StageId | null;
  currentLevel: number | null;
  currentBasicLevel: number | null;
  currentSystemLevel: number | null;
  gainFromPoint0: number | null;
  dynamics: Dynamics;
  competencies: CompetencyProgress[];
}

export function computeStudentProgress(
  modules: readonly number[],
  scoresByStage: Readonly<Record<StageId, StageScores | undefined>>,
): StudentProgress {
  const ordered = orderStages(modules).map((stage) => ({ stage, scores: scoresByStage[stage] ?? {} }));
  const metrics = ordered.map((s) => stageMetrics(s.stage, s.scores));

  const scoredStages = metrics.filter((m) => m.scored > 0);
  const latestScored = scoredStages[scoredStages.length - 1] ?? null;
  const completeStages = metrics.filter((m) => m.complete);
  const latestComplete = completeStages[completeStages.length - 1] ?? null;
  const p0 = metrics[0]!;

  const gain =
    p0.complete && latestComplete && latestComplete.stage !== POINT0 ? latestComplete.level! - p0.level! : null;

  const competencies = COMPETENCIES.map(({ code, group }): CompetencyProgress => {
    const withScore = ordered.filter((s) => s.scores[code] !== undefined);
    const cur = withScore[withScore.length - 1] ?? null;
    const prior = withScore[withScore.length - 2] ?? null;
    const p0Value = ordered[0]!.scores[code] ?? null;
    const currentValue = cur ? (cur.scores[code] as number) : null;
    return {
      code,
      group,
      currentStage: cur?.stage ?? null,
      currentValue,
      point0Value: p0Value,
      changeFromPoint0:
        currentValue !== null && p0Value !== null && cur!.stage !== POINT0 ? currentValue - p0Value : null,
      priorStage: prior?.stage ?? null,
      priorValue: prior ? (prior.scores[code] as number) : null,
      changeFromPrior: currentValue !== null && prior ? currentValue - (prior.scores[code] as number) : null,
    };
  });

  return {
    stages: metrics,
    currentStage: latestScored?.stage ?? null,
    currentStageScored: latestScored?.scored ?? 0,
    currentLevelStage: latestComplete?.stage ?? null,
    currentLevel: latestComplete?.level ?? null,
    currentBasicLevel: latestComplete?.basicLevel ?? null,
    currentSystemLevel: latestComplete?.systemLevel ?? null,
    gainFromPoint0: gain,
    dynamics: computeDynamics(ordered),
    competencies,
  };
}

export interface GroupSummary {
  studentCount: number;
  dynamicsCounts: Record<DynamicsLabel, number>;
  /** Mean (unrounded) change from Point 0 per competency over the students who have one. */
  competencyGain: Record<CompetencyCode, { mean: number | null; students: number }>;
  /** Number of students with a complete assessment at every stage of the cohort. */
  completeByStage: Record<StageId, number>;
}

export function summarizeGroup(students: readonly StudentProgress[], modules: readonly number[]): GroupSummary {
  const dynamicsCounts: Record<DynamicsLabel, number> = {
    point0_incomplete: 0,
    only_point0: 0,
    attention: 0,
    stagnation: 0,
    steady: 0,
    rapid: 0,
  };
  const completeByStage: Record<StageId, number> = Object.fromEntries(orderStages(modules).map((s) => [s, 0]));
  const acc = Object.fromEntries(COMPETENCY_CODES.map((c) => [c, { total: 0, students: 0 }])) as Record<
    CompetencyCode,
    { total: number; students: number }
  >;

  for (const st of students) {
    dynamicsCounts[st.dynamics.label]++;
    for (const m of st.stages) if (m.complete && m.stage in completeByStage) completeByStage[m.stage]!++;
    for (const c of st.competencies) {
      if (c.changeFromPoint0 !== null) {
        acc[c.code].total += c.changeFromPoint0;
        acc[c.code].students++;
      }
    }
  }

  const competencyGain = Object.fromEntries(
    COMPETENCY_CODES.map((c) => [c, { mean: acc[c].students ? acc[c].total / acc[c].students : null, students: acc[c].students }]),
  ) as GroupSummary["competencyGain"];

  return { studentCount: students.length, dynamicsCounts, competencyGain, completeByStage };
}

/* ---------- display helpers (never use for classification) ---------- */

/** Round half away from zero to one decimal; never returns -0. */
export function roundOneDecimal(value: number): number {
  const r = Math.sign(value) * Math.round(Math.abs(value) * 10 + 1e-9);
  return (r === 0 ? 0 : r) / 10;
}

/** "+1.5", "0", "−0.3" (U+2212). Locale decimal separator is the UI's job. */
export function formatSignedOneDecimal(value: number): string {
  const r = roundOneDecimal(value);
  if (r === 0) return "0";
  const abs = Math.abs(r).toFixed(1);
  return r > 0 ? `+${abs}` : `−${abs}`;
}

/** Signed whole-number change for competency deltas: "+3", "0", "−2". */
export function formatSignedInt(value: number): string {
  if (value === 0) return "0";
  return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
}

/* ---------- stage availability (spec section 5) ---------- */

export type StageAvailability =
  | { available: true }
  | { available: false; reason: "unknown_stage" | "not_configured" | "final_needs_module" }
  | { available: false; reason: "prior_unscored"; requires: StageId };

/**
 * Point 0 is always editable. A configured later stage opens once the immediately prior
 * configured stage has at least one score. Final also needs at least one module. A stage
 * that already has scores stays editable (no silent lock). `scoredByStage` = scores per stage.
 */
export function stageAvailability(
  modules: readonly number[],
  stage: StageId,
  scoredByStage: Readonly<Record<StageId, number | undefined>>,
): StageAvailability {
  if (!isValidStageId(stage)) return { available: false, reason: "unknown_stage" };
  if (stage === POINT0) return { available: true };
  if (stage === FINAL && modules.length === 0) {
    return (scoredByStage[stage] ?? 0) > 0 ? { available: true } : { available: false, reason: "final_needs_module" };
  }
  const ordered = orderStages(modules);
  const idx = ordered.indexOf(stage);
  if (idx === -1) {
    return (scoredByStage[stage] ?? 0) > 0 ? { available: true } : { available: false, reason: "not_configured" };
  }
  if ((scoredByStage[stage] ?? 0) > 0) return { available: true };
  const prior = ordered[idx - 1]!;
  return (scoredByStage[prior] ?? 0) > 0 ? { available: true } : { available: false, reason: "prior_unscored", requires: prior };
}
