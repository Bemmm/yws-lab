import { z } from "zod";
import { getAsana } from "@/features/builder/asana-manifest";
import {
  DESCRIPTION_MAX,
  DOCUMENT_MAX_BYTES,
  MAX_SEGMENTS,
  MAX_SESSIONS,
  MAX_SLOTS,
  MIN_SLOTS,
  SCHEDULE_MAX_DAYS,
  SCHEDULE_MIN_DAYS,
  SCHEDULE_ROW_LABEL_MAX,
  SEGMENT_MAX_COUNT,
  SESSION_TITLE_MAX,
  SIDE_MAX_LEN,
  SLOT_COLORS,
  TITLE_MAX,
  normalizeSlot,
  type Program,
  type Schedule,
  type ScheduleCell,
  type Session,
  type Slot,
} from "@/features/builder/model";

/** Server-side document validation (spec §2): the client is never trusted. */

const MAX_SCHEDULE_ROWS = 30;
const ID = z.string().min(1).max(80);
const color = z.enum(SLOT_COLORS);

const segment = z.object({ type: z.enum(["S", "D"]), count: z.number().int().min(1).max(SEGMENT_MAX_COUNT) });

const asana = z.object({
  id: z.string().refine((id) => !!getAsana(id), "unknown asana"),
  // Overwritten from the catalog manifest; accepted only so honest clients validate.
  src: z.string().max(200).optional(),
  label: z.string().max(100).optional(),
});

const slot = z
  .object({
    asana: asana.optional(),
    segments: z.array(segment).max(MAX_SEGMENTS).optional(),
    color: color.optional(),
    side: z.string().max(SIDE_MAX_LEN).optional(),
  })
  .nullable();

const session = z.object({
  id: ID,
  title: z.string().max(SESSION_TITLE_MAX),
  description: z.string().max(DESCRIPTION_MAX).optional(),
  slots: z.array(slot).min(MIN_SLOTS).max(MAX_SLOTS),
  slotIds: z.array(ID).min(MIN_SLOTS).max(MAX_SLOTS),
});

const schedule = z.object({
  enabled: z.boolean(),
  days: z.number().int().min(SCHEDULE_MIN_DAYS).max(SCHEDULE_MAX_DAYS),
  cells: z.record(ID, z.array(color.nullable()).max(SCHEDULE_MAX_DAYS)),
  rows: z.array(z.object({ id: ID, label: z.string().max(SCHEDULE_ROW_LABEL_MAX), color })).max(MAX_SCHEDULE_ROWS).optional(),
});

const program = z.object({
  id: z.string().max(80).optional(), // ignored: the row id is the only identity
  title: z.string().max(TITLE_MAX),
  description: z.string().max(DESCRIPTION_MAX).optional(),
  sessions: z.array(session).min(1).max(MAX_SESSIONS),
  schedule: schedule.optional(),
});

export type ValidationResult = { ok: true; doc: Program } | { ok: false; reason: string };

/**
 * Validate an untrusted document and return the canonical form to store:
 * asana src/label come from the catalog, `id` is the row id, empty text is absent, orphan schedule
 * cells are pruned. Never includes document text in `reason`.
 */
export function validatePlanDocument(raw: unknown, planId: string): ValidationResult {
  let size: number;
  try {
    size = Buffer.byteLength(JSON.stringify(raw) ?? "", "utf8");
  } catch {
    return { ok: false, reason: "unserializable" };
  }
  if (size > DOCUMENT_MAX_BYTES) return { ok: false, reason: "too_large" };

  const parsed = program.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: `schema:${parsed.error.issues[0]?.path.join(".") ?? ""}` };
  const p = parsed.data;

  const slotIds = new Set<string>();
  const sessionIds = new Set<string>();
  const sessions: Session[] = [];
  for (const s of p.sessions) {
    if (s.slots.length !== s.slotIds.length) return { ok: false, reason: "slot_ids_length" };
    if (sessionIds.has(s.id)) return { ok: false, reason: "duplicate_session_id" };
    sessionIds.add(s.id);
    for (const id of s.slotIds) {
      // dnd-kit ids must be unique across the whole editor, not only inside a set.
      if (slotIds.has(id)) return { ok: false, reason: "duplicate_slot_id" };
      slotIds.add(id);
    }
    const slots: Slot[] = s.slots.map((sl) => {
      if (!sl) return null;
      const a = sl.asana ? getAsana(sl.asana.id) : undefined;
      return normalizeSlot({
        ...(a ? { asana: { id: a.id, src: a.src, label: a.label } } : {}),
        ...(sl.segments?.length ? { segments: sl.segments } : {}),
        ...(sl.color ? { color: sl.color } : {}),
        ...(sl.side?.trim() ? { side: sl.side.trim() } : {}),
      });
    });
    sessions.push({
      id: s.id,
      title: s.title,
      ...(s.description ? { description: s.description } : {}),
      slots,
      slotIds: s.slotIds,
    });
  }

  let sched: Schedule | undefined;
  if (p.schedule) {
    const rows = p.schedule.rows ?? [];
    const rowIds = new Set<string>();
    for (const r of rows) {
      if (rowIds.has(r.id) || sessionIds.has(r.id)) return { ok: false, reason: "duplicate_row_id" };
      rowIds.add(r.id);
    }
    const cells: Record<string, ScheduleCell[]> = {};
    for (const [key, arr] of Object.entries(p.schedule.cells)) {
      if (arr.length > p.schedule.days) return { ok: false, reason: "cells_exceed_days" };
      if (sessionIds.has(key) || rowIds.has(key)) cells[key] = arr;
    }
    sched = { enabled: p.schedule.enabled, days: p.schedule.days, cells, ...(rows.length ? { rows } : {}) };
  }

  return {
    ok: true,
    doc: {
      id: planId,
      title: p.title,
      ...(p.description ? { description: p.description } : {}),
      sessions,
      ...(sched ? { schedule: sched } : {}),
    },
  };
}

/** Deterministic JSON (sorted keys) so two equal documents compare equal regardless of key order. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
