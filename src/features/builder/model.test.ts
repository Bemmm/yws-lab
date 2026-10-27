import { describe, expect, it } from "vitest";
import { ASANAS, getAsana } from "./asana-manifest";
import {
  MAX_SESSIONS,
  MAX_SLOTS,
  cloneWithNewIds,
  newProgram,
  opAddScheduleRow,
  opAddSession,
  opAddToFirstEmpty,
  opClearProgram,
  opMoveSessionBy,
  opMoveSlot,
  opMoveSlotBy,
  opRemoveScheduleRow,
  opRemoveSession,
  opSetScheduleCell,
  opSetScheduleDays,
  opSetSegments,
  opSetSlot,
  opSetSlotColor,
  opSetSlotSide,
  opSetSlotsCount,
  programStats,
  type Program,
} from "./model";

const A = ASANAS[0]!;
const B = ASANAS[1]!;
const C = ASANAS[2]!;

function base(): Program {
  return newProgram("p1", "Plan", "Set 1");
}
const sid = (p: Program, i = 0) => p.sessions[i]!.id;

describe("catalog", () => {
  it("has 1,239 unique asanas with stable ids", () => {
    expect(ASANAS).toHaveLength(1239);
    expect(new Set(ASANAS.map((a) => a.id)).size).toBe(1239);
    expect(getAsana("L1/frame-1973.svg")?.src).toBe("/asanas/L1/frame-1973.svg");
  });
});

describe("side quirk fix (spec decision 3)", () => {
  function withSideAndSegments() {
    let p = base();
    p = opSetSlot(p, sid(p), 0, A);
    p = opSetSegments(p, sid(p), 0, [{ type: "S", count: 3 }]);
    p = opSetSlotSide(p, sid(p), 0, "L");
    p = opSetSlotColor(p, sid(p), 0, "sky");
    return p;
  }

  it("clearing all segments on a filled slot keeps asana, colour and side", () => {
    let p = withSideAndSegments();
    p = opSetSegments(p, sid(p), 0, []);
    expect(p.sessions[0]!.slots[0]).toEqual({
      asana: { id: A.id, src: A.src, label: A.label },
      color: "sky",
      side: "L",
    });
  });

  it("clearing the asana of a slot with segments keeps segments and side, drops colour", () => {
    let p = withSideAndSegments();
    p = opSetSlot(p, sid(p), 0, null);
    expect(p.sessions[0]!.slots[0]).toEqual({ segments: [{ type: "S", count: 3 }], side: "L" });
  });

  it("side goes away only when the slot becomes fully empty", () => {
    let p = withSideAndSegments();
    p = opSetSlot(p, sid(p), 0, null); // asana-less, segments + side remain
    p = opSetSegments(p, sid(p), 0, []); // now fully empty
    expect(p.sessions[0]!.slots[0]).toBeNull();

    let q = base();
    q = opSetSlot(q, sid(q), 0, A);
    q = opSetSlotSide(q, sid(q), 0, "R");
    q = opSetSlot(q, sid(q), 0, null); // no segments -> null
    expect(q.sessions[0]!.slots[0]).toBeNull();
  });

  it("side and colour are only settable on a slot with an asana; side is trimmed and capped", () => {
    let p = base();
    expect(opSetSlotSide(p, sid(p), 0, "L")).toBe(p);
    expect(opSetSlotColor(p, sid(p), 0, "rose")).toBe(p);
    p = opSetSlot(p, sid(p), 0, A);
    p = opSetSlotSide(p, sid(p), 0, "  abcdefg ");
    expect(p.sessions[0]!.slots[0]!.side).toBe("abcd");
    p = opSetSlotSide(p, sid(p), 0, "   ");
    expect(p.sessions[0]!.slots[0]!.side).toBeUndefined();
  });
});

describe("segments", () => {
  it("caps at 3, drops count <= 0, allows breath-only slots", () => {
    let p = base();
    p = opSetSegments(p, sid(p), 2, [
      { type: "S", count: 3 },
      { type: "D", count: 0 },
      { type: "D", count: 4 },
      { type: "S", count: 5 },
      { type: "S", count: 6 },
    ]);
    expect(p.sessions[0]!.slots[2]!.segments).toEqual([
      { type: "S", count: 3 },
      { type: "D", count: 4 },
      { type: "S", count: 5 },
    ]);
    expect(p.sessions[0]!.slots[2]!.asana).toBeUndefined();
  });
});

describe("adding asanas", () => {
  it("click-add fills the first slot without an asana and keeps its breath", () => {
    let p = base();
    p = opSetSegments(p, sid(p), 0, [{ type: "D", count: 2 }]);
    const res = opAddToFirstEmpty(p, A);
    expect(res.added).toBe(true);
    expect(res.program.sessions[0]!.slots[0]).toMatchObject({ asana: { id: A.id }, segments: [{ type: "D", count: 2 }] });
  });

  it("appends a slot to the last set when everything is full, and reports a full program", () => {
    let p = base();
    p = opSetSlotsCount(p, sid(p), 1);
    p = opSetSlot(p, sid(p), 0, A);
    const added = opAddToFirstEmpty(p, B);
    expect(added.added).toBe(true);
    expect(added.program.sessions[0]!.slots).toHaveLength(2);
    expect(added.program.sessions[0]!.slotIds).toHaveLength(2);

    let full = opSetSlotsCount(base(), sid(base()), MAX_SLOTS);
    for (let i = 0; i < MAX_SLOTS; i++) full = opAddToFirstEmpty(full, A).program;
    const res = opAddToFirstEmpty(full, B);
    expect(res.added).toBe(false);
    expect(res.program).toBe(full);
  });
});

describe("moving", () => {
  function three() {
    let p = base();
    p = opSetSlot(p, sid(p), 0, A);
    p = opSetSlot(p, sid(p), 1, B);
    p = opSetSlot(p, sid(p), 2, C);
    return p;
  }
  const ids = (p: Program, i = 0) => p.sessions[i]!.slots.map((s) => s?.asana?.id ?? null);

  it("reorders inside a set and the slot id travels with its content", () => {
    const p = three();
    const movedId = p.sessions[0]!.slotIds[0];
    const q = opMoveSlot(p, sid(p), 0, sid(p), 2);
    expect(ids(q).slice(0, 3)).toEqual([B.id, C.id, A.id]);
    expect(q.sessions[0]!.slotIds[2]).toBe(movedId);
  });

  it("swaps across sets (empty target = plain move)", () => {
    let p = opAddSession(three(), "Set 2");
    p = opSetSlot(p, sid(p, 1), 0, B);
    const q = opMoveSlot(p, sid(p, 0), 0, sid(p, 1), 0);
    expect(ids(q, 0)[0]).toBe(B.id);
    expect(ids(q, 1)[0]).toBe(A.id);
    const r = opMoveSlot(p, sid(p, 0), 0, sid(p, 1), 3);
    expect(ids(r, 0)[0]).toBeNull();
    expect(ids(r, 1)[3]).toBe(A.id);
  });

  it("keyboard move earlier/later reorders and crosses set boundaries", () => {
    let p = opAddSession(three(), "Set 2");
    p = opSetSlot(p, sid(p, 1), 0, B);
    expect(ids(opMoveSlotBy(p, sid(p, 0), 1, -1))[0]).toBe(B.id);
    // first slot, earlier: no previous set -> unchanged
    expect(opMoveSlotBy(p, sid(p, 0), 0, -1)).toBe(p);
    // last slot of set 1 (index 5) is empty -> nothing to move; move slot 2 to the end first
    const q = opMoveSlot(p, sid(p, 0), 2, sid(p, 0), 5);
    const crossed = opMoveSlotBy(q, sid(q, 0), 5, 1);
    expect(ids(crossed, 1)[0]).toBe(C.id);
    expect(ids(crossed, 0)[5]).toBe(B.id);
    // empty slots cannot be moved
    expect(opMoveSlotBy(p, sid(p, 0), 4, 1)).toBe(p);
  });

  it("moves sets up and down (keyboard alternative)", () => {
    let p = opAddSession(opAddSession(base(), "B"), "C");
    const order = () => p.sessions.map((s) => s.title);
    p = opMoveSessionBy(p, sid(p, 0), 1);
    expect(order()).toEqual(["B", "Set 1", "C"]);
    expect(opMoveSessionBy(p, sid(p, 0), -1)).toBe(p);
  });
});

describe("sets and slots counts", () => {
  it("clamps slots to 1..36 and keeps slotIds parallel", () => {
    let p = base();
    p = opSetSlotsCount(p, sid(p), 100);
    expect(p.sessions[0]!.slots).toHaveLength(36);
    expect(new Set(p.sessions[0]!.slotIds).size).toBe(36);
    p = opSetSlotsCount(p, sid(p), 0);
    expect(p.sessions[0]!.slots).toHaveLength(1);
    expect(p.sessions[0]!.slotIds).toHaveLength(1);
  });

  it("never removes the last set and caps the number of sets", () => {
    const p = base();
    expect(opRemoveSession(p, sid(p))).toBe(p);
    let q = p;
    for (let i = 0; i < MAX_SESSIONS + 5; i++) q = opAddSession(q, `S${i}`);
    expect(q.sessions).toHaveLength(MAX_SESSIONS);
  });

  it("clear program keeps id and title, drops description and schedule", () => {
    let p: Program = { ...base(), description: "d" };
    p = opSetScheduleDays(p, 10);
    const q = opClearProgram(p, "Set 1");
    expect(q).toMatchObject({ id: "p1", title: "Plan" });
    expect(q.description).toBeUndefined();
    expect(q.schedule).toBeUndefined();
    expect(q.sessions).toHaveLength(1);
  });
});

describe("schedule", () => {
  it("trims cells when days shrink, drops empty rows, ignores out-of-range days", () => {
    let p = base();
    p = opSetScheduleDays(p, 7);
    p = opSetScheduleCell(p, sid(p), 6, "orange");
    expect(p.schedule!.cells[sid(p)]).toHaveLength(7);
    p = opSetScheduleDays(p, 3);
    expect(p.schedule!.cells[sid(p)]).toHaveLength(3);
    expect(opSetScheduleCell(p, sid(p), 5, "orange")).toBe(p);
    p = opSetScheduleCell(p, sid(p), 0, "orange");
    p = opSetScheduleCell(p, sid(p), 0, null);
    expect(p.schedule!.cells[sid(p)]).toBeUndefined();
    expect(opSetScheduleDays(p, 99).schedule!.days).toBe(31);
  });

  it("activity rows get distinct non-amber/orange colours until the pool is exhausted; removal deletes cells", () => {
    let p = base();
    for (let i = 0; i < 4; i++) p = opAddScheduleRow(p);
    const colors = p.schedule!.rows!.map((r) => r.color);
    expect(new Set(colors).size).toBe(4);
    expect(colors.some((c) => c === "amber" || c === "orange")).toBe(false);
    const row = p.schedule!.rows![0]!;
    p = opSetScheduleCell(p, row.id, 1, row.color);
    p = opRemoveScheduleRow(p, row.id);
    expect(p.schedule!.cells[row.id]).toBeUndefined();
    expect(p.schedule!.rows).toHaveLength(3);
  });
});

describe("derived data", () => {
  it("programStats counts asana slots and takes the first 4 images", () => {
    let p = opAddSession(base(), "Set 2");
    for (const a of ASANAS.slice(0, 6)) p = opAddToFirstEmpty(p, a).program;
    p = opSetSegments(p, sid(p, 1), 3, [{ type: "S", count: 1 }]);
    const s = programStats(p);
    expect(s).toMatchObject({ setsCount: 2, filledSlotsCount: 6, slotsCount: 12 });
    expect(s.previewSrcs).toEqual(ASANAS.slice(0, 4).map((a) => a.src));
  });

  it("cloneWithNewIds changes every id and re-keys schedule cells", () => {
    let p = opAddSession(base(), "Set 2");
    p = opSetSlot(p, sid(p), 0, A);
    p = opAddScheduleRow(p);
    p = opSetScheduleCell(p, sid(p), 0, "orange");
    p = opSetScheduleCell(p, p.schedule!.rows![0]!.id, 2, p.schedule!.rows![0]!.color);
    const c = cloneWithNewIds(p, "p2");
    expect(c.id).toBe("p2");
    expect(c.sessions.map((s) => s.id).some((id) => p.sessions.some((o) => o.id === id))).toBe(false);
    expect(c.sessions[0]!.slotIds.some((id) => p.sessions[0]!.slotIds.includes(id))).toBe(false);
    expect(c.sessions[0]!.slots[0]).toEqual(p.sessions[0]!.slots[0]);
    expect(Object.keys(c.schedule!.cells).sort()).toEqual([c.sessions[0]!.id, c.schedule!.rows![0]!.id].sort());
    expect(c.schedule!.rows![0]!.id).not.toBe(p.schedule!.rows![0]!.id);
  });
});
