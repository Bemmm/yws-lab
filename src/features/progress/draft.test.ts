import { describe, expect, it } from "vitest";
import { COMPETENCY_CODES } from "@/server/progress/competencies";
import {
  changedCodes,
  clampScore,
  countAssessed,
  isDirty,
  parseScoreInput,
  sliderKey,
  sliderPosition,
  toDraft,
  toPayload,
} from "./draft";

describe("parseScoreInput", () => {
  it("maps empty to unassessed and keeps zero as a real score", () => {
    expect(parseScoreInput("")).toBeNull();
    expect(parseScoreInput("  ")).toBeNull();
    expect(parseScoreInput("0")).toBe(0);
  });
  it("rounds and clamps to 0-10", () => {
    expect(parseScoreInput("7")).toBe(7);
    expect(parseScoreInput("7,6")).toBe(8);
    expect(parseScoreInput("11")).toBe(10);
    expect(parseScoreInput("-3")).toBe(0);
  });
  it("ignores non-numeric input", () => {
    expect(parseScoreInput("abc")).toBeUndefined();
    expect(parseScoreInput("1e3")).toBeUndefined();
  });
});

describe("slider", () => {
  it("clamps", () => {
    expect(clampScore(12)).toBe(10);
    expect(clampScore(-1)).toBe(0);
  });
  it("rests unassessed rows at 0", () => {
    expect(sliderPosition(null)).toBe(0);
    expect(sliderPosition(6)).toBe(6);
  });
  it("Home/End select 0/10 and arrows step by 1", () => {
    expect(sliderKey("Home", 5)).toBe(0);
    expect(sliderKey("End", null)).toBe(10);
    expect(sliderKey("ArrowRight", 5)).toBe(6);
    expect(sliderKey("ArrowLeft", 5)).toBe(4);
    expect(sliderKey("ArrowRight", 10)).toBe(10);
    expect(sliderKey("ArrowLeft", 0)).toBe(0);
    expect(sliderKey("ArrowRight", null)).toBe(0);
    expect(sliderKey("a", 3)).toBeNull();
  });
});

describe("draft state", () => {
  const base = toDraft({ confidence: 4, coordination: 0 });
  it("starts clean and counts assessed rows", () => {
    expect(isDirty(base, { ...base })).toBe(false);
    expect(countAssessed(base)).toBe(2);
    expect(Object.keys(base)).toHaveLength(COMPETENCY_CODES.length);
  });
  it("detects edits, clears and reverts", () => {
    const edited = { ...base, confidence: 5 };
    expect(changedCodes(base, edited)).toEqual(["confidence"]);
    expect(isDirty(base, { ...base, coordination: null })).toBe(true);
    expect(isDirty(base, { ...edited, confidence: 4 })).toBe(false);
    expect(isDirty(base, { ...base, speech_voice: 0 })).toBe(true); // 0 differs from unassessed
  });
  it("builds a full payload with nulls for unassessed", () => {
    const p = toPayload(base);
    expect(Object.keys(p)).toHaveLength(16);
    expect(p.confidence).toBe(4);
    expect(p.speech_voice).toBeNull();
  });
});

describe("curator note helpers", () => {
  it("normalizes: trims, empty and whitespace become null", async () => {
    const { normalizeNote } = await import("./draft");
    expect(normalizeNote("  hi \n")).toBe("hi");
    expect(normalizeNote("   ")).toBeNull();
    expect(normalizeNote(null)).toBeNull();
  });
  it("dirty compares normalized values", async () => {
    const { isNoteDirty } = await import("./draft");
    expect(isNoteDirty(null, "")).toBe(false);
    expect(isNoteDirty(null, "  ")).toBe(false);
    expect(isNoteDirty("a", "a ")).toBe(false);
    expect(isNoteDirty("a", "b")).toBe(true);
    expect(isNoteDirty("a", "")).toBe(true);
  });
});
