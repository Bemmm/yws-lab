/**
 * Training-plan document model and pure operations on it (no React, no server code),
 * shared by the editor hook, the server validator and the tests.
 *
 * A *program* (plan) has *sessions* ("sets"); a session is a row of slots. A slot holds a
 * snapshot of an asana (id+src+label, denormalized so plans survive catalog changes), a breath
 * rhythm (segments), a colour and a side marker. See specs/02-training-plan-builder.md §2.
 */

import type { Asana } from "./asana-manifest";

export type SegmentType = "S" | "D";
export type Segment = { type: SegmentType; count: number };

export const SLOT_COLORS = ["amber", "emerald", "orange", "sky", "violet", "rose"] as const;
/** Closed enum of colour keys. Unknown keys render as no colour. */
export type SlotColor = (typeof SLOT_COLORS)[number];

/** Side marker: `L`/`R` quick toggles or a short custom mark (free string, <= SIDE_MAX_LEN). */
export type SlotSide = string;
export type SlotAsana = { id: string; src: string; label: string };

/** `null` = blank; a slot may hold only segments (breath laid out before any asana). */
export type Slot = { asana?: SlotAsana; segments?: Segment[]; color?: SlotColor; side?: SlotSide } | null;

export type Session = {
  id: string;
  title: string;
  description?: string;
  slots: Slot[];
  /** Stable id per slot, parallel to `slots`; travels with the slot on reorder. */
  slotIds: string[];
};

export type ScheduleCell = SlotColor | null;
export type ScheduleRow = { id: string; label: string; color: SlotColor };
export type Schedule = {
  enabled: boolean;
  days: number;
  /** Keyed by session id (set rows) or ScheduleRow.id (activity rows). */
  cells: Record<string, ScheduleCell[]>;
  rows?: ScheduleRow[];
};

export type Program = {
  id: string;
  title: string;
  description?: string;
  sessions: Session[];
  schedule?: Schedule;
};

/* ─── Limits (spec §2) ─────────────────────────────────────────────── */
export const DEFAULT_SLOTS = 6;
export const MIN_SLOTS = 1;
export const MAX_SLOTS = 36;
export const MAX_SEGMENTS = 3;
export const SEGMENT_MAX_COUNT = 999;
export const MAX_SESSIONS = 50;
export const SCHEDULE_MIN_DAYS = 1;
export const SCHEDULE_MAX_DAYS = 31;
export const SCHEDULE_DEFAULT_DAYS = 7;
export const SCHEDULE_ROW_LABEL_MAX = 24;
export const SIDE_MAX_LEN = 4;
export const SIDE_INPUT_MAX_LEN = 3;
export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 5000;
export const SESSION_TITLE_MAX = 60;
export const DOCUMENT_MAX_BYTES = 256 * 1024;

/** Colours an activity row can take (never amber/orange: those belong to sets). */
const ACTIVITY_COLORS: SlotColor[] = ["emerald", "sky", "violet", "rose"];
/** Set rows of the schedule fill with this colour. */
export const SCHEDULE_FILL: SlotColor = "orange";

/* ─── Ids ──────────────────────────────────────────────────────────── */
let uidSeq = 0;
export function makeUid(): string {
  uidSeq += 1;
  return `u${uidSeq}-${Math.random().toString(36).slice(2, 7)}`;
}
export function makeUids(count: number): string[] {
  return Array.from({ length: count }, makeUid);
}
function makeSessionId(): string {
  uidSeq += 1;
  return `s-${Date.now()}-${uidSeq}-${Math.random().toString(36).slice(2, 6)}`;
}
function makeRowId(): string {
  uidSeq += 1;
  return `sr-${Date.now()}-${uidSeq}-${Math.random().toString(36).slice(2, 6)}`;
}

function emptySlots(count: number): Slot[] {
  return Array.from({ length: count }, () => null);
}

export function newSession(title: string, slotCount = DEFAULT_SLOTS): Session {
  return { id: makeSessionId(), title, slots: emptySlots(slotCount), slotIds: makeUids(slotCount) };
}

/** A new empty program (one set of 6 empty slots). Titles are localized by the caller. */
export function newProgram(id: string, title: string, firstSessionTitle: string): Program {
  return { id, title, sessions: [newSession(firstSessionTitle)] };
}

/* ─── Predicates ───────────────────────────────────────────────────── */
/** "Empty" = no asana yet (the slot may still hold segments). */
export function isEmptySlot(slot: Slot): boolean {
  return !slot || !slot.asana;
}

/** True when the slot holds anything at all. */
export function hasSlotContent(slot: Slot): boolean {
  return !!slot && (!!slot.asana || (slot.segments?.length ?? 0) > 0 || !!slot.color);
}

/** Normalization: a slot with no asana, no segments and no colour becomes null (side alone is dropped). */
export function normalizeSlot(raw: Slot): Slot {
  if (!raw) return null;
  const next: NonNullable<Slot> = {};
  if (raw.asana) next.asana = raw.asana;
  if (raw.segments && raw.segments.length > 0) next.segments = raw.segments;
  if (raw.color) next.color = raw.color;
  if (typeof raw.side === "string" && raw.side.trim()) next.side = raw.side.trim().slice(0, SIDE_MAX_LEN);
  if (!next.asana && !next.segments && !next.color) return null;
  return next;
}

function snapshot(asana: Asana): SlotAsana {
  return { id: asana.id, src: asana.src, label: asana.label };
}

/* ─── Pure operations (each returns the same object when nothing changes) ─ */
function mapSession(p: Program, sessionId: string, fn: (s: Session) => Session): Program {
  let changed = false;
  const sessions = p.sessions.map((s) => {
    if (s.id !== sessionId) return s;
    const next = fn(s);
    if (next !== s) changed = true;
    return next;
  });
  return changed ? { ...p, sessions } : p;
}

export function opAddSession(p: Program, title: string): Program {
  if (p.sessions.length >= MAX_SESSIONS) return p;
  return { ...p, sessions: [...p.sessions, newSession(title)] };
}

export function opRemoveSession(p: Program, sessionId: string): Program {
  if (p.sessions.length <= 1) return p;
  return { ...p, sessions: p.sessions.filter((s) => s.id !== sessionId) };
}

/** Move `activeId` to `overId`'s position. */
export function opReorderSessions(p: Program, activeId: string, overId: string): Program {
  if (activeId === overId) return p;
  const from = p.sessions.findIndex((s) => s.id === activeId);
  const to = p.sessions.findIndex((s) => s.id === overId);
  if (from === -1 || to === -1) return p;
  const sessions = p.sessions.slice();
  const [moved] = sessions.splice(from, 1);
  sessions.splice(to, 0, moved!);
  return { ...p, sessions };
}

/** Keyboard alternative to dragging a set: move one position up (-1) or down (+1). */
export function opMoveSessionBy(p: Program, sessionId: string, delta: -1 | 1): Program {
  const from = p.sessions.findIndex((s) => s.id === sessionId);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= p.sessions.length) return p;
  const sessions = p.sessions.slice();
  const [moved] = sessions.splice(from, 1);
  sessions.splice(to, 0, moved!);
  return { ...p, sessions };
}

export function opSetSlotsCount(p: Program, sessionId: string, count: number): Program {
  const next = Math.max(MIN_SLOTS, Math.min(MAX_SLOTS, Math.round(count)));
  return mapSession(p, sessionId, (s) => {
    if (next === s.slots.length) return s;
    if (next > s.slots.length) {
      const add = next - s.slots.length;
      return { ...s, slots: [...s.slots, ...emptySlots(add)], slotIds: [...s.slotIds, ...makeUids(add)] };
    }
    // Shrinking drops trailing slots even if filled; the UI confirms first.
    return { ...s, slots: s.slots.slice(0, next), slotIds: s.slotIds.slice(0, next) };
  });
}

/**
 * Put an asana into the first slot without one (sets top-down, slots left-to-right), keeping that
 * slot's segments/colour/side. If every slot has an asana, append a slot to the last set (cap 36).
 * `added` is false when everything is full (the UI then says so).
 */
export function opAddToFirstEmpty(p: Program, asana: Asana): { program: Program; added: boolean } {
  const snap = snapshot(asana);
  for (let si = 0; si < p.sessions.length; si++) {
    const s = p.sessions[si]!;
    const idx = s.slots.findIndex(isEmptySlot);
    if (idx === -1) continue;
    const slots = s.slots.slice();
    slots[idx] = { ...(slots[idx] ?? {}), asana: snap };
    const sessions = p.sessions.slice();
    sessions[si] = { ...s, slots };
    return { program: { ...p, sessions }, added: true };
  }
  const last = p.sessions[p.sessions.length - 1];
  if (!last || last.slots.length >= MAX_SLOTS) return { program: p, added: false };
  const sessions = p.sessions.slice();
  sessions[sessions.length - 1] = {
    ...last,
    slots: [...last.slots, { asana: snap }],
    slotIds: [...last.slotIds, makeUid()],
  };
  return { program: { ...p, sessions }, added: true };
}

/**
 * Set (asana) or clear (null) the asana of a slot.
 * Side quirk fix (spec decision 3): `side` is dropped only when the slot becomes fully empty, so
 * clearing the asana of a slot that still has breath segments keeps the side marker.
 */
export function opSetSlot(p: Program, sessionId: string, slotIndex: number, asana: Asana | null): Program {
  return mapSession(p, sessionId, (s) => {
    if (slotIndex < 0 || slotIndex >= s.slots.length) return s;
    const slots = s.slots.slice();
    const existing = slots[slotIndex];
    if (asana) {
      slots[slotIndex] = { ...(existing ?? {}), asana: snapshot(asana) };
    } else if (existing?.segments?.length) {
      // Colour is only meaningful with an asana; segments and side stay.
      const { asana: _asana, color: _color, ...rest } = existing;
      void _asana;
      void _color;
      slots[slotIndex] = rest;
    } else {
      slots[slotIndex] = null;
    }
    return { ...s, slots };
  });
}

/**
 * Replace the breath segments of a slot (<= 3, count > 0).
 * Side quirk fix: clearing all segments on a filled slot keeps asana, colour AND side; on an
 * asana-less slot the slot becomes fully empty (null) and side goes with it.
 */
export function opSetSegments(p: Program, sessionId: string, slotIndex: number, segments: Segment[]): Program {
  return mapSession(p, sessionId, (s) => {
    if (slotIndex < 0 || slotIndex >= s.slots.length) return s;
    const slots = s.slots.slice();
    const slot = slots[slotIndex];
    const clean = segments
      .filter((seg) => seg.count > 0)
      .slice(0, MAX_SEGMENTS)
      .map((seg) => ({ type: seg.type, count: Math.min(SEGMENT_MAX_COUNT, Math.round(seg.count)) }));
    if (clean.length === 0) {
      if (!slot || !slot.asana) slots[slotIndex] = null;
      else {
        const { segments: _segments, ...rest } = slot;
        void _segments;
        slots[slotIndex] = rest;
      }
    } else {
      slots[slotIndex] = { ...(slot ?? {}), segments: clean };
    }
    return { ...s, slots };
  });
}

/** Colour is settable only on a slot with an asana. */
export function opSetSlotColor(p: Program, sessionId: string, slotIndex: number, color: SlotColor | null): Program {
  return mapSession(p, sessionId, (s) => {
    const slot = s.slots[slotIndex];
    if (!slot || !slot.asana) return s;
    if ((slot.color ?? null) === color) return s;
    const slots = s.slots.slice();
    const { color: _c, ...rest } = slot;
    void _c;
    slots[slotIndex] = color ? { ...rest, color } : rest;
    return { ...s, slots };
  });
}

/** Side is settable only on a slot with an asana; stored trimmed, <= SIDE_MAX_LEN chars. */
export function opSetSlotSide(p: Program, sessionId: string, slotIndex: number, side: SlotSide | null): Program {
  return mapSession(p, sessionId, (s) => {
    const slot = s.slots[slotIndex];
    if (!slot || !slot.asana) return s;
    const clean = side?.trim().slice(0, SIDE_MAX_LEN) || null;
    if ((slot.side ?? null) === clean) return s;
    const slots = s.slots.slice();
    const { side: _s, ...rest } = slot;
    void _s;
    slots[slotIndex] = clean ? { ...rest, side: clean } : rest;
    return { ...s, slots };
  });
}

/**
 * Move a filled slot. Same set: reorder (slots in between slide). Different sets: swap with the
 * target slot (an empty target is a plain move). Ids travel with their content.
 */
export function opMoveSlot(
  p: Program,
  fromSessionId: string,
  fromIndex: number,
  toSessionId: string,
  toIndex: number,
): Program {
  if (fromSessionId === toSessionId) {
    if (fromIndex === toIndex) return p;
    return mapSession(p, fromSessionId, (s) => {
      if (!s.slots[fromIndex] || toIndex < 0 || toIndex >= s.slots.length) return s;
      const slots = s.slots.slice();
      const slotIds = s.slotIds.slice();
      const [moved] = slots.splice(fromIndex, 1);
      const [movedId] = slotIds.splice(fromIndex, 1);
      slots.splice(toIndex, 0, moved!);
      slotIds.splice(toIndex, 0, movedId!);
      return { ...s, slots, slotIds };
    });
  }
  const sessions = p.sessions.map((s) => ({ ...s, slots: s.slots.slice(), slotIds: s.slotIds.slice() }));
  const from = sessions.find((s) => s.id === fromSessionId);
  const to = sessions.find((s) => s.id === toSessionId);
  if (!from || !to) return p;
  const moving = from.slots[fromIndex];
  if (!moving || toIndex < 0 || toIndex >= to.slots.length) return p;
  const displaced = to.slots[toIndex] ?? null;
  to.slots[toIndex] = moving;
  from.slots[fromIndex] = displaced;
  const movingId = from.slotIds[fromIndex]!;
  from.slotIds[fromIndex] = to.slotIds[toIndex]!;
  to.slotIds[toIndex] = movingId;
  return { ...p, sessions };
}

/**
 * Keyboard alternative to dragging a slot: "Move earlier/later". Inside a set it reorders; past the
 * set boundary it swaps with the last (earlier) or first (later) slot of the neighbouring set.
 */
export function opMoveSlotBy(p: Program, sessionId: string, slotIndex: number, delta: -1 | 1): Program {
  const si = p.sessions.findIndex((s) => s.id === sessionId);
  const s = p.sessions[si];
  if (!s || !s.slots[slotIndex]) return p;
  const target = slotIndex + delta;
  if (target >= 0 && target < s.slots.length) return opMoveSlot(p, sessionId, slotIndex, sessionId, target);
  const neighbour = p.sessions[si + delta];
  if (!neighbour) return p;
  return opMoveSlot(p, sessionId, slotIndex, neighbour.id, delta < 0 ? neighbour.slots.length - 1 : 0);
}

/** Clear program: one empty set; keeps id and title, drops description and schedule. */
export function opClearProgram(p: Program, firstSessionTitle: string): Program {
  return { id: p.id, title: p.title, sessions: [newSession(firstSessionTitle)] };
}

/* ─── Schedule ─────────────────────────────────────────────────────── */
export function emptySchedule(enabled = false): Schedule {
  return { enabled, days: SCHEDULE_DEFAULT_DAYS, cells: {} };
}

function pickActivityColor(existing: ScheduleRow[], random: () => number): SlotColor {
  const used = new Set(existing.map((r) => r.color));
  const free = ACTIVITY_COLORS.filter((c) => !used.has(c));
  const pool = free.length ? free : ACTIVITY_COLORS;
  return pool[Math.floor(random() * pool.length)]!;
}

export function opSetScheduleEnabled(p: Program, enabled: boolean): Program {
  return { ...p, schedule: { ...(p.schedule ?? emptySchedule()), enabled } };
}

export function opSetScheduleDays(p: Program, days: number): Program {
  const n = Math.max(SCHEDULE_MIN_DAYS, Math.min(SCHEDULE_MAX_DAYS, Math.round(days)));
  const cur = p.schedule ?? emptySchedule(true);
  const cells: Record<string, ScheduleCell[]> = {};
  for (const [k, arr] of Object.entries(cur.cells)) cells[k] = arr.slice(0, n);
  return { ...p, schedule: { ...cur, days: n, cells } };
}

export function opAddScheduleRow(p: Program, random: () => number = Math.random): Program {
  const cur = p.schedule ?? emptySchedule(true);
  const existing = cur.rows ?? [];
  const row: ScheduleRow = { id: makeRowId(), label: "", color: pickActivityColor(existing, random) };
  return { ...p, schedule: { ...cur, rows: [...existing, row] } };
}

export function opRemoveScheduleRow(p: Program, rowId: string): Program {
  const cur = p.schedule ?? emptySchedule(true);
  const cells = { ...cur.cells };
  delete cells[rowId];
  return { ...p, schedule: { ...cur, cells, rows: (cur.rows ?? []).filter((r) => r.id !== rowId) } };
}

export function opRenameScheduleRow(p: Program, rowId: string, label: string): Program {
  const clean = label.slice(0, SCHEDULE_ROW_LABEL_MAX);
  const cur = p.schedule ?? emptySchedule(true);
  return { ...p, schedule: { ...cur, rows: (cur.rows ?? []).map((r) => (r.id === rowId ? { ...r, label: clean } : r)) } };
}

export function opSetScheduleCell(p: Program, rowKey: string, dayIndex: number, color: SlotColor | null): Program {
  const cur = p.schedule ?? emptySchedule(true);
  if (dayIndex < 0 || dayIndex >= cur.days) return p;
  const row = (cur.cells[rowKey] ?? []).slice();
  while (row.length <= dayIndex) row.push(null);
  if (row[dayIndex] === color) return p;
  row[dayIndex] = color;
  const cells = { ...cur.cells };
  if (row.every((c) => c == null)) delete cells[rowKey];
  else cells[rowKey] = row;
  return { ...p, schedule: { ...cur, cells } };
}

/* ─── Derived data ─────────────────────────────────────────────────── */
export type ProgramStats = { setsCount: number; filledSlotsCount: number; slotsCount: number; previewSrcs: string[] };

/** Library card numbers: sets, filled (asana) slots over all slots, first 4 asana images. */
export function programStats(p: Pick<Program, "sessions">): ProgramStats {
  let filled = 0;
  let total = 0;
  const previewSrcs: string[] = [];
  for (const s of p.sessions) {
    total += s.slots.length;
    for (const slot of s.slots) {
      if (!slot?.asana) continue;
      filled += 1;
      if (previewSrcs.length < 4) previewSrcs.push(slot.asana.src);
    }
  }
  return { setsCount: p.sessions.length, filledSlotsCount: filled, slotsCount: total, previewSrcs };
}

/** True when the program has something worth showing in preview / on the public page. */
export function hasProgramContent(p: Program): boolean {
  return (
    !!p.description ||
    (!!p.schedule?.enabled && p.sessions.length > 0) ||
    p.sessions.some((s) => !!s.description || s.slots.some((sl) => sl?.asana))
  );
}

/** Copy of a program with fresh ids everywhere (sessions, slots, activity rows); cells are re-keyed. */
export function cloneWithNewIds(p: Program, newId: string): Program {
  const idMap = new Map<string, string>();
  const sessions = p.sessions.map((s) => {
    const id = makeSessionId();
    idMap.set(s.id, id);
    return { ...s, id, slots: s.slots.map((sl) => (sl ? structuredClone(sl) : null)), slotIds: makeUids(s.slots.length) };
  });
  let schedule: Schedule | undefined;
  if (p.schedule) {
    const rows = p.schedule.rows?.map((r) => {
      const id = makeRowId();
      idMap.set(r.id, id);
      return { ...r, id };
    });
    const cells: Record<string, ScheduleCell[]> = {};
    for (const [k, v] of Object.entries(p.schedule.cells)) {
      const nk = idMap.get(k);
      if (nk) cells[nk] = v.slice();
    }
    schedule = { ...p.schedule, cells, ...(rows ? { rows } : {}) };
  }
  return { ...p, id: newId, sessions, ...(schedule ? { schedule } : {}) };
}
