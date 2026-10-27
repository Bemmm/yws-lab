import { describe, expect, it } from "vitest";
import { ASANAS } from "@/features/builder/asana-manifest";
import { DOCUMENT_MAX_BYTES, type Program } from "@/features/builder/model";
import { stableStringify, validatePlanDocument } from "./document";

const A = ASANAS[0]!;

function doc(over: Record<string, unknown> = {}) {
  return {
    id: "client-chosen-id",
    title: "Plan",
    sessions: [
      {
        id: "s1",
        title: "Set 1",
        slots: [{ asana: { id: A.id, src: "/evil.svg", label: "Evil" }, segments: [{ type: "S", count: 3 }], color: "sky", side: "L" }, null],
        slotIds: ["a", "b"],
      },
    ],
    ...over,
  };
}
const session = (over: Record<string, unknown>) => ({ id: "s1", title: "T", slots: [null], slotIds: ["x"], ...over });

describe("validatePlanDocument", () => {
  it("accepts a valid document and canonicalizes it (catalog src/label, row id)", () => {
    const res = validatePlanDocument(doc(), "row-id");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.doc.id).toBe("row-id");
    expect(res.doc.sessions[0]!.slots[0]!.asana).toEqual({ id: A.id, src: A.src, label: A.label });
  });

  it.each([
    ["unknown asana id", doc({ sessions: [session({ slots: [{ asana: { id: "L1/nope.svg" } }] })] })],
    ["37 slots", doc({ sessions: [session({ slots: Array(37).fill(null), slotIds: Array.from({ length: 37 }, (_, i) => `i${i}`) })] })],
    ["0 slots", doc({ sessions: [session({ slots: [], slotIds: [] })] })],
    ["4 segments", doc({ sessions: [session({ slots: [{ segments: Array(4).fill({ type: "S", count: 1 }) }] })] })],
    ["segment count 0", doc({ sessions: [session({ slots: [{ segments: [{ type: "S", count: 0 }] }] })] })],
    ["segment count 1000", doc({ sessions: [session({ slots: [{ segments: [{ type: "D", count: 1000 }] }] })] })],
    ["segment type X", doc({ sessions: [session({ slots: [{ segments: [{ type: "X", count: 1 }] }] })] })],
    ["colour outside the enum", doc({ sessions: [session({ slots: [{ asana: { id: A.id }, color: "teal" }] })] })],
    ["side of 5 chars", doc({ sessions: [session({ slots: [{ asana: { id: A.id }, side: "abcde" }] })] })],
    ["title of 121 chars", doc({ title: "x".repeat(121) })],
    ["description of 5001 chars", doc({ description: "x".repeat(5001) })],
    ["set title of 61 chars", doc({ sessions: [session({ title: "x".repeat(61) })] })],
    ["no sets", doc({ sessions: [] })],
    ["51 sets", doc({ sessions: Array.from({ length: 51 }, (_, i) => session({ id: `s${i}`, slotIds: [`k${i}`] })) })],
    ["slots/slotIds length mismatch", doc({ sessions: [session({ slots: [null, null], slotIds: ["x"] })] })],
    ["duplicate slot ids across sets", doc({ sessions: [session({ id: "s1", slotIds: ["same"] }), session({ id: "s2", slotIds: ["same"] })] })],
    ["duplicate set ids", doc({ sessions: [session({ slotIds: ["x"] }), session({ slotIds: ["y"] })] })],
    ["schedule of 0 days", doc({ schedule: { enabled: true, days: 0, cells: {} } })],
    ["schedule of 32 days", doc({ schedule: { enabled: true, days: 32, cells: {} } })],
    ["cells longer than days", doc({ schedule: { enabled: true, days: 2, cells: { s1: ["sky", null, "sky"] } } })],
    ["activity label of 25 chars", doc({ schedule: { enabled: true, days: 7, cells: {}, rows: [{ id: "r", label: "x".repeat(25), color: "sky" }] } })],
    ["not an object", "hello"],
    ["null", null],
  ])("rejects %s", (_name, input) => {
    expect(validatePlanDocument(input, "row-id").ok).toBe(false);
  });

  it("accepts the documented maxima", () => {
    const sessions = Array.from({ length: 50 }, (_, i) => ({
      id: `s${i}`,
      title: "x".repeat(60),
      slots: Array(2).fill(null),
      slotIds: [`a${i}`, `b${i}`],
    }));
    sessions[0] = { ...sessions[0]!, slots: Array(36).fill(null), slotIds: Array.from({ length: 36 }, (_, i) => `m${i}`) };
    const res = validatePlanDocument(
      {
        title: "x".repeat(120),
        description: "y".repeat(5000),
        sessions,
        schedule: { enabled: true, days: 31, cells: { s0: Array(31).fill("orange") }, rows: [{ id: "r", label: "x".repeat(24), color: "rose" }] },
      },
      "id",
    );
    expect(res.ok).toBe(true);
  });

  it("rejects documents over 256 KB", () => {
    const big = doc({ description: "x".repeat(DOCUMENT_MAX_BYTES) });
    const res = validatePlanDocument(big, "row-id");
    expect(res).toEqual({ ok: false, reason: "too_large" });
  });

  it("normalizes: empty text is absent, empty slots become null, orphan schedule cells are pruned", () => {
    const res = validatePlanDocument(
      doc({
        description: "",
        sessions: [session({ description: "", slots: [{ side: "L" }, {}], slotIds: ["a", "b"] })],
        schedule: { enabled: true, days: 3, cells: { s1: ["orange", null, null], ghost: ["sky"] } },
      }),
      "id",
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const d: Program = res.doc;
    expect(d.description).toBeUndefined();
    expect(d.sessions[0]!.description).toBeUndefined();
    expect(d.sessions[0]!.slots).toEqual([null, null]);
    expect(Object.keys(d.schedule!.cells)).toEqual(["s1"]);
  });

  it("never leaks document text in the rejection reason", () => {
    const secret = "TOP-SECRET-TEXT";
    const res = validatePlanDocument(doc({ title: secret.repeat(20) }), "id");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).not.toContain(secret);
  });
});

describe("stableStringify", () => {
  it("ignores key order and undefined values", () => {
    expect(stableStringify({ b: 1, a: { d: [1, { y: 1, x: undefined }], c: null } })).toBe(stableStringify({ a: { c: null, d: [1, { y: 1 }] }, b: 1 }));
  });
});
