import { describe, expect, it } from "vitest";
import { filtersQuery, nextAssessStage, parseFilters } from "./nav";
import { sparkGeometry } from "./sparkline";

describe("filters", () => {
  it("round-trips valid filters and drops unknown values", () => {
    expect(parseFilters({ profile: "reframing", dynamics: "rapid" })).toEqual({ profile: "reframing", dynamics: "rapid" });
    expect(parseFilters({ profile: "x", dynamics: ["attention", "rapid"] })).toEqual({ profile: undefined, dynamics: "attention" });
    expect(filtersQuery({ profile: "polishing" })).toBe("?profile=polishing");
    expect(filtersQuery({})).toBe("");
  });
});

describe("nextAssessStage", () => {
  it("starts at Point 0", () => expect(nextAssessStage([1, 2], null, 0)).toBe("point0"));
  it("stays on a partial stage", () => expect(nextAssessStage([1, 2], "m1", 9)).toBe("m1"));
  it("moves on after a complete stage", () => {
    expect(nextAssessStage([1, 2], "point0", 16)).toBe("m1");
    expect(nextAssessStage([1, 2], "m2", 16)).toBe("final");
    expect(nextAssessStage([1, 2], "final", 16)).toBe("final");
  });
});

describe("sparkGeometry", () => {
  it("plots only assessed stages on a shared 0-10 axis", () => {
    const g = sparkGeometry([3, null, 7, null], 120, 36, 4);
    expect(g.points.map((p) => p.index)).toEqual([0, 2]);
    const hi = sparkGeometry([10], 120, 36, 4).points[0]!.y;
    const lo = sparkGeometry([0], 120, 36, 4).points[0]!.y;
    expect(hi).toBe(4);
    expect(lo).toBe(32);
    expect(g.line.split(" ")).toHaveLength(2);
  });
  it("draws no line for a single point and handles empty", () => {
    expect(sparkGeometry([null, 5, null]).line).toBe("");
    expect(sparkGeometry([null, null]).points).toEqual([]);
  });
});
