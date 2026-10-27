import { describe, expect, it } from "vitest";
import {
  classifyDelta,
  computeDynamics,
  computeStudentProgress,
  formatSignedInt,
  formatSignedOneDecimal,
  isComplete,
  orderStages,
  roundOneDecimal,
  scoredCount,
  stageAvailability,
  stageMetrics,
  summarizeGroup,
  type StageScores,
} from "./calc";
import { COMPETENCY_CODES, type CompetencyCode } from "./competencies";

const full = (n: number, over: Partial<Record<CompetencyCode, number>> = {}): StageScores => ({
  ...Object.fromEntries(COMPETENCY_CODES.map((c) => [c, n])),
  ...over,
});
/** Complete stage whose 16 scores sum to `total` (distributed as evenly as possible). */
const withSum = (total: number): StageScores => {
  const base = Math.floor(total / 16);
  const extra = total - base * 16;
  return Object.fromEntries(COMPETENCY_CODES.map((c, i) => [c, base + (i < extra ? 1 : 0)]));
};
const dyn = (a: StageScores, b: StageScores) =>
  computeDynamics([
    { stage: "point0", scores: a },
    { stage: "m1", scores: b },
  ]);

describe("stage ordering", () => {
  it("point0, modules ascending, final", () => {
    expect(orderStages([4, 1, 2])).toEqual(["point0", "m1", "m2", "m4", "final"]);
    expect(orderStages([12, 3])).toEqual(["point0", "m3", "m12", "final"]);
    expect(orderStages([])).toEqual(["point0", "final"]);
    expect(orderStages([2, 2])).toEqual(["point0", "m2", "final"]);
  });
});

describe("completeness and levels", () => {
  it("complete only at 16/16; zero is a score", () => {
    expect(isComplete(full(0))).toBe(true);
    expect(scoredCount(full(0))).toBe(16);
    const partial = full(5);
    delete (partial as Record<string, number>).transitions;
    expect(isComplete(partial)).toBe(false);
    expect(scoredCount(partial)).toBe(15);
    expect(stageMetrics("point0", partial).level).toBeNull();
  });
  it("level, basic and system are means of raw integers", () => {
    const s = full(4, { speech_voice: 10, system_principles: 10 });
    const m = stageMetrics("point0", s);
    expect(m.level).toBe((14 * 4 + 20) / 16);
    expect(m.basicLevel).toBe((8 * 4 + 10) / 9);
    expect(m.systemLevel).toBe((6 * 4 + 10) / 7);
  });
  it("all-zero stage has level 0 (not null)", () => {
    expect(stageMetrics("point0", full(0)).level).toBe(0);
  });
});

describe("dynamics classification", () => {
  it("thresholds on the raw number", () => {
    expect(classifyDelta(-0.0001)).toBe("attention");
    expect(classifyDelta(0)).toBe("stagnation");
    expect(classifyDelta(0.2999999)).toBe("stagnation");
    expect(classifyDelta(0.3)).toBe("steady");
    expect(classifyDelta(1.4999999)).toBe("steady");
    expect(classifyDelta(1.5)).toBe("rapid");
    expect(classifyDelta(9)).toBe("rapid");
  });
  it("sum differences around the boundaries (16 denominator)", () => {
    const p0 = withSum(80);
    expect(dyn(p0, withSum(80)).label).toBe("stagnation"); // delta exactly 0
    expect(dyn(p0, withSum(84)).label).toBe("stagnation"); // 0.25
    expect(dyn(p0, withSum(85)).label).toBe("steady"); // 0.3125
    expect(dyn(p0, withSum(103)).label).toBe("steady"); // 1.4375
    expect(dyn(p0, withSum(104)).label).toBe("rapid"); // exactly 1.5
    expect(dyn(p0, withSum(104)).delta).toBe(1.5);
    expect(dyn(p0, withSum(79)).label).toBe("attention"); // -0.0625
  });
  it("rounding is never used: 0.25 displays 0.3 but is Stagnation", () => {
    const d = dyn(withSum(80), withSum(84));
    expect(roundOneDecimal(d.delta!)).toBe(0.3);
    expect(d.label).toBe("stagnation");
    const e = dyn(withSum(80), withSum(103)); // 1.4375 displays 1.4; 1.46 would display 1.5
    expect(e.label).toBe("steady");
  });
  it("competency fall of exactly 2 triggers Attention, 1 does not", () => {
    const p0 = full(5);
    expect(dyn(p0, full(7, { mode_command: 3 })).label).toBe("attention"); // 5->3 = -2, level up
    expect(dyn(p0, full(7, { mode_command: 4 })).label).toBe("rapid"); // 5->4 = -1
    expect(dyn(p0, full(7, { mode_command: 3 })).delta).toBeGreaterThan(1.5);
  });
  it("attention reason: overall fall wins over competency falls", () => {
    const d = dyn(full(8), full(5));
    expect(d.reason).toEqual({ kind: "level_fall", delta: -3 });
  });
  it("attention reason: first competency in fixed order plus count of others", () => {
    const p0 = full(5);
    const curr = full(8, { transitions: 3, confidence: 3, system_principles: 2 });
    const d = dyn(p0, curr);
    expect(d.label).toBe("attention");
    expect(d.reason).toEqual({ kind: "competency_fall", code: "confidence", fall: 2, others: 2 });
  });
  it("zero scores count as real values (5 -> 0 is a fall of 5)", () => {
    const d = dyn(full(5), full(7, { speech_voice: 0 }));
    expect(d.reason).toEqual({ kind: "competency_fall", code: "speech_voice", fall: 5, others: 0 });
  });
  it("Point 0 incomplete wins over everything", () => {
    const partial = full(5);
    delete (partial as Record<string, number>).confidence;
    expect(dyn(partial, full(9)).label).toBe("point0_incomplete");
    expect(computeDynamics([]).label).toBe("point0_incomplete");
    expect(dyn({}, {}).label).toBe("point0_incomplete");
  });
  it("only Point 0 complete", () => {
    expect(dyn(full(5), {}).label).toBe("only_point0");
    const partial = full(9);
    delete (partial as Record<string, number>).confidence;
    expect(dyn(full(5), partial).label).toBe("only_point0");
  });
  it("compares the last two complete stages, skipping partial ones", () => {
    const partial = full(1);
    delete (partial as Record<string, number>).confidence;
    const d = computeDynamics([
      { stage: "point0", scores: full(3) },
      { stage: "m1", scores: full(5) },
      { stage: "m2", scores: partial },
      { stage: "m4", scores: full(5) },
      { stage: "final", scores: {} },
    ]);
    expect(d.from).toBe("m1");
    expect(d.to).toBe("m4");
    expect(d.label).toBe("stagnation");
  });
});

describe("student progress", () => {
  it("no scores at all", () => {
    const p = computeStudentProgress([1, 2], {});
    expect(p.currentStage).toBeNull();
    expect(p.currentLevel).toBeNull();
    expect(p.gainFromPoint0).toBeNull();
    expect(p.dynamics.label).toBe("point0_incomplete");
    expect(p.competencies.every((c) => c.currentValue === null)).toBe(true);
  });
  it("modules 1,2,4: current stage, level, gain", () => {
    const partial = { confidence: 9, coordination: 0 };
    const p = computeStudentProgress([4, 1, 2], {
      point0: full(4),
      m1: full(6),
      m2: partial,
      m4: undefined,
    });
    expect(p.stages.map((s) => s.stage)).toEqual(["point0", "m1", "m2", "m4", "final"]);
    expect(p.currentStage).toBe("m2");
    expect(p.currentStageScored).toBe(2);
    expect(p.currentLevelStage).toBe("m1");
    expect(p.currentLevel).toBe(6);
    expect(p.gainFromPoint0).toBe(2);
    const conf = p.competencies.find((c) => c.code === "confidence")!;
    expect(conf).toMatchObject({ currentStage: "m2", currentValue: 9, changeFromPoint0: 5, priorStage: "m1", changeFromPrior: 3 });
    const coord = p.competencies.find((c) => c.code === "coordination")!;
    expect(coord).toMatchObject({ currentValue: 0, changeFromPoint0: -4, changeFromPrior: -6 });
    const other = p.competencies.find((c) => c.code === "mode_command")!;
    expect(other).toMatchObject({ currentStage: "m1", currentValue: 6, changeFromPoint0: 2, changeFromPrior: 2 });
  });
  it("gain needs a complete later stage; Point 0 alone gives a level but no gain", () => {
    const only = computeStudentProgress([1], { point0: full(5) });
    expect(only.currentLevel).toBe(5);
    expect(only.gainFromPoint0).toBeNull();
    const p0Partial = { ...full(5) } as Record<string, number>;
    delete p0Partial.confidence;
    const noP0 = computeStudentProgress([1], { point0: p0Partial, m1: full(7) });
    expect(noP0.currentLevel).toBe(7);
    expect(noP0.gainFromPoint0).toBeNull();
  });
  it("competency with only a Point 0 score has no changes; never-scored stays null", () => {
    const p = computeStudentProgress([1], { point0: { confidence: 4 } });
    const c = p.competencies.find((x) => x.code === "confidence")!;
    expect(c).toMatchObject({ currentStage: "point0", currentValue: 4, changeFromPoint0: null, changeFromPrior: null });
    expect(p.competencies.find((x) => x.code === "transitions")!.currentValue).toBeNull();
  });
  it("final stage is last", () => {
    const p = computeStudentProgress([1], { point0: full(2), m1: full(3), final: full(9) });
    expect(p.currentLevelStage).toBe("final");
    expect(p.gainFromPoint0).toBe(7);
    expect(p.dynamics).toMatchObject({ label: "rapid", from: "m1", to: "final" });
  });
});

describe("group summary", () => {
  it("counts, per-competency mean gain with contributors, complete per stage", () => {
    const a = computeStudentProgress([1], { point0: full(4), m1: full(6) }); // steady? delta 2 -> rapid
    const b = computeStudentProgress([1], { point0: full(4), m1: full(4, { confidence: 1 }) }); // attention
    const c = computeStudentProgress([1], { point0: { confidence: 2 }, m1: { confidence: 5 } }); // p0 incomplete, conf +3
    const d = computeStudentProgress([1], { point0: full(5) });
    const g = summarizeGroup([a, b, c, d], [1]);
    expect(g.studentCount).toBe(4);
    expect(g.dynamicsCounts).toEqual({ point0_incomplete: 1, only_point0: 1, attention: 1, stagnation: 0, steady: 0, rapid: 1 });
    expect(g.completeByStage).toEqual({ point0: 3, m1: 2, final: 0 });
    // confidence: a +2, b -3, c +3 (d has no later score)
    expect(g.competencyGain.confidence).toEqual({ mean: (2 - 3 + 3) / 3, students: 3 });
    // coordination: a +2, b 0
    expect(g.competencyGain.coordination).toEqual({ mean: 1, students: 2 });
  });
  it("empty group", () => {
    const g = summarizeGroup([], [1]);
    expect(g.studentCount).toBe(0);
    expect(g.competencyGain.confidence).toEqual({ mean: null, students: 0 });
    expect(g.completeByStage).toEqual({ point0: 0, m1: 0, final: 0 });
  });
});

describe("stage availability", () => {
  it("point0 always; later stages need prior stage scored", () => {
    expect(stageAvailability([1, 2], "point0", {})).toEqual({ available: true });
    expect(stageAvailability([1, 2], "m1", {})).toEqual({ available: false, reason: "prior_unscored", requires: "point0" });
    expect(stageAvailability([1, 2], "m1", { point0: 1 })).toEqual({ available: true });
    expect(stageAvailability([1, 2], "m2", { point0: 16 })).toEqual({ available: false, reason: "prior_unscored", requires: "m1" });
    expect(stageAvailability([1, 2], "final", { m2: 1 })).toEqual({ available: true });
  });
  it("skips unconfigured modules; unconfigured has no stage; final needs a module", () => {
    expect(stageAvailability([1, 4], "m4", { m1: 3 })).toEqual({ available: true });
    expect(stageAvailability([1, 4], "m2", { m1: 3 })).toEqual({ available: false, reason: "not_configured" });
    expect(stageAvailability([], "final", { point0: 16 })).toEqual({ available: false, reason: "final_needs_module" });
    expect(stageAvailability([1], "m13", {})).toEqual({ available: false, reason: "unknown_stage" });
  });
  it("already scored later stages stay editable", () => {
    expect(stageAvailability([1, 2], "m2", { m2: 5 })).toEqual({ available: true });
  });
});

describe("display helpers", () => {
  it("rounds half away from zero to one decimal, symmetric", () => {
    expect(roundOneDecimal(0.25)).toBe(0.3);
    expect(roundOneDecimal(-0.25)).toBe(-0.3);
    expect(roundOneDecimal(1.4375)).toBe(1.4);
    expect(roundOneDecimal(-0.01)).toBe(0);
    expect(Object.is(roundOneDecimal(-0.01), -0)).toBe(false);
  });
  it("signed formatting", () => {
    expect(formatSignedOneDecimal(1.5)).toBe("+1.5");
    expect(formatSignedOneDecimal(0)).toBe("0");
    expect(formatSignedOneDecimal(-0.3)).toBe("−0.3");
    expect(formatSignedInt(3)).toBe("+3");
    expect(formatSignedInt(0)).toBe("0");
    expect(formatSignedInt(-2)).toBe("−2");
  });
});
