'use client'
/* eslint-disable max-lines-per-function -- useProgram aggregates 10+ small reducer-like actions; splitting would add indirection without reducing complexity */

import { useEffect, useRef, useState } from 'react'
import type { Asana } from './asana-manifest'

/**
 * Workout-builder state. A *program* contains sessions; each session is a
 * row of 6 slots. Each slot either holds a snapshot of an asana (id+src+label
 * — denormalised so the program survives manifest renames) or is null.
 */

export type SegmentType = 'S' | 'D'
export type Segment = { type: SegmentType; count: number }
export const MAX_SEGMENTS = 3

/**
 * Closed enum of colour keys the user can paint a slot footer with. Keys are
 * stable — adding a new colour means appending here and to PAINT_COLORS in
 * builder-client.tsx. Removed colours just stop rendering (graceful fallback).
 */
export type SlotColor = 'amber' | 'emerald' | 'orange' | 'sky' | 'violet' | 'rose'

/**
 * Side/marker the asana is performed on (undefined = both / not specified, "—").
 * 'L'/'R' are the conventional values toggled by the side control, but the middle
 * field accepts any short custom letter, so this is a free string (≤4 chars).
 */
export type SlotSide = string

export type SlotAsana = { id: string; src: string; label: string }

/**
 * A slot can hold any of:
 *  - null                                 → completely blank
 *  - { segments: [...] }                  → breath count assigned but no asana yet
 *  - { asana: {...} }                     → asana dropped, no breaths
 *  - { asana, segments, color }           → fully filled
 * Common workflow: lay out the breath rhythm first, then drop asanas into the
 * pre-filled slots without disturbing the segment data.
 */
export type Slot =
  | { asana?: SlotAsana; segments?: Segment[]; color?: SlotColor; side?: SlotSide }
  | null

export type Session = {
  id: string
  title: string
  /** Free-text note for the whole set (e.g. "repeat ×3, pause 3/6/9 breaths"). */
  description?: string
  slots: Slot[]
  /**
   * Stable id per slot, parallel to `slots` (same length). These travel WITH
   * the slot content through reorders/moves — unlike a position index — so the
   * sortable can run its layout (FLIP) animation when slots change order.
   */
  slotIds: string[]
}

/** One painted cell in the schedule grid (a colour key) or null = empty. */
export type ScheduleCell = SlotColor | null

/**
 * Optional weekly/training schedule grid shown above the program description.
 * Rows are the program's sets (auto, keyed by sessionId so they survive
 * reorder/rename); columns are days D1…Dn. Cells are painted with the same
 * colour palette as slots. `cells[sessionId][dayIndex]` → colour or absent.
 */
/** A custom row below the sets — a separate sport/activity (e.g. "running"). */
export type ScheduleRow = { id: string; label: string; color: SlotColor }

// Colours an activity row can take: every paint colour EXCEPT amber (sets are
// yellow) and orange (the set fill) — so activities stay visually distinct.
const ACTIVITY_COLORS: SlotColor[] = ['emerald', 'sky', 'violet', 'rose']

// Pick a colour not already used by an existing row (random, non-repeating);
// once the pool is exhausted, fall back to any activity colour.
function pickActivityColor(existing: ScheduleRow[]): SlotColor {
  const used = new Set(existing.map((r) => r.color))
  const free = ACTIVITY_COLORS.filter((c) => !used.has(c))
  const pool = free.length ? free : ACTIVITY_COLORS
  return pool[Math.floor(Math.random() * pool.length)]
}

export type Schedule = {
  enabled: boolean
  days: number
  /** Cells keyed by sessionId (set rows) or ScheduleRow.id (custom rows). */
  cells: Record<string, ScheduleCell[]>
  /** Extra custom-named rows below the sets (painted green). */
  rows?: ScheduleRow[]
}

let scheduleRowSeq = 0
function newScheduleRow(color: SlotColor, label = ''): ScheduleRow {
  scheduleRowSeq += 1
  return { id: `sr-${Date.now()}-${scheduleRowSeq}-${Math.random().toString(36).slice(2, 6)}`, label, color }
}

export type Program = {
  id: string
  title: string
  /** Free-text plan for the whole program (auto-grow textarea above the sets). */
  description?: string
  sessions: Session[]
  schedule?: Schedule
}

export const STORAGE_KEY = 'papaya.workout-program.v1'
const DEFAULT_SLOTS = 6
export const MIN_SLOTS = 1
export const MAX_SLOTS = 36
export const SCHEDULE_MIN_DAYS = 1
export const SCHEDULE_MAX_DAYS = 31
const SCHEDULE_DEFAULT_DAYS = 7

const SLOT_COLORS: SlotColor[] = ['amber', 'emerald', 'orange', 'sky', 'violet', 'rose']

function emptySchedule(enabled = false): Schedule {
  return { enabled, days: SCHEDULE_DEFAULT_DAYS, cells: {} }
}

// Tolerant parse of a persisted schedule (any shape) → valid Schedule | undefined.
function normalizeSchedule(raw: unknown): Schedule | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const days =
    typeof o.days === 'number'
      ? Math.max(SCHEDULE_MIN_DAYS, Math.min(SCHEDULE_MAX_DAYS, Math.round(o.days)))
      : SCHEDULE_DEFAULT_DAYS
  const cells: Record<string, ScheduleCell[]> = {}
  if (o.cells && typeof o.cells === 'object') {
    for (const [k, v] of Object.entries(o.cells as Record<string, unknown>)) {
      if (!Array.isArray(v)) continue
      cells[k] = v
        .slice(0, days)
        .map((c) => (typeof c === 'string' && (SLOT_COLORS as string[]).includes(c) ? (c as SlotColor) : null))
    }
  }
  const rows: ScheduleRow[] = []
  if (Array.isArray(o.rows)) {
    for (const r of o.rows) {
      if (r && typeof r === 'object') {
        const ro = r as Record<string, unknown>
        const id = typeof ro.id === 'string' ? ro.id : null
        const label = typeof ro.label === 'string' ? ro.label.slice(0, 24) : ''
        const color = typeof ro.color === 'string' && (SLOT_COLORS as string[]).includes(ro.color) ? (ro.color as SlotColor) : 'emerald'
        if (id) rows.push({ id, label, color })
      }
    }
  }
  return { enabled: Boolean(o.enabled), days, cells, rows: rows.length ? rows : undefined }
}

function emptySlots(count: number): Slot[] {
  return Array.from({ length: count }, () => null)
}

// Globally-unique slot id (counter + random suffix). Not serialised as visible
// text, so a server/client mismatch in the initial value is harmless — dnd-kit's
// aria ids are stabilised separately via the DndContext `id`.
let uidSeq = 0
function makeUid(): string {
  uidSeq += 1
  return `u${uidSeq}-${Math.random().toString(36).slice(2, 7)}`
}
function makeUids(count: number): string[] {
  return Array.from({ length: count }, makeUid)
}

function newSession(title: string, slotCount = DEFAULT_SLOTS): Session {
  return {
    id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    slots: emptySlots(slotCount),
    slotIds: makeUids(slotCount),
  }
}

// Accepts both the legacy flat shape and the new nested shape.
// Slots that end up "empty" (no asana, no segments, no color) become null
// so the UI's empty-state heuristic stays trivial.
function normalizeSlot(raw: unknown): Slot {
  if (raw == null) return null
  const obj = raw as Record<string, unknown>
  // Legacy: { id, src, label, segments?, color? }
  if (typeof obj.id === 'string' && typeof obj.src === 'string') {
    return {
      asana: { id: obj.id, src: obj.src, label: String(obj.label ?? '') },
      segments: obj.segments as Segment[] | undefined,
      color: obj.color as SlotColor | undefined,
      side: typeof obj.side === 'string' && obj.side.trim() ? obj.side.trim().slice(0, 4) : undefined,
    }
  }
  // New: { asana?, segments?, color?, side? }
  const next: NonNullable<Slot> = {}
  if (obj.asana && typeof obj.asana === 'object') next.asana = obj.asana as SlotAsana
  if (Array.isArray(obj.segments) && obj.segments.length > 0) next.segments = obj.segments as Segment[]
  if (typeof obj.color === 'string') next.color = obj.color as SlotColor
  if (typeof obj.side === 'string' && obj.side.trim()) next.side = obj.side.trim().slice(0, 4)
  if (!next.asana && !next.segments && !next.color) return null
  return next
}

// "Empty" in the sense of "no asana dropped here yet". The slot may still hold
// segments waiting for an asana.
export function isEmptySlot(slot: Slot): boolean {
  return !slot || !slot.asana
}

function defaultProgram(): Program {
  return {
    id: `p-${Date.now()}`,
    title: 'Новая программа',
    sessions: [newSession('Сет 1')],
  }
}

/** Autosave lifecycle state surfaced to the builder header indicator. */
export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export type UseProgramOptions = {
  /** Server-loaded program — when present, seeds state instead of the default. */
  initial?: Program
  /**
   * Server persistence. When provided, the hook runs in *server mode*: it persists
   * the program via this (debounced) instead of localStorage and exposes
   * `saveState`. Resolved `{ status:'ok' }` / `{ ok:true }` ⇒ saved, else error.
   * When omitted, the hook falls back to the legacy localStorage behaviour
   * (kept as a safety net; the builder always runs in server mode now).
   */
  save?: (program: Program) => Promise<{ status?: string; ok?: boolean }>
}

const AUTOSAVE_DEBOUNCE_MS = 1500

export function useProgram(opts?: UseProgramOptions) {
  const save = opts?.save
  const serverMode = Boolean(save)
  const [program, setProgram] = useState<Program>(() => opts?.initial ?? defaultProgram())
  // Server mode: `initial` is already the source of truth → hydrated immediately.
  const [hydrated, setHydrated] = useState(serverMode)
  const [saveState, setSaveState] = useState<SaveState>('idle')

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seqRef = useRef(0)
  // Skip the first persist run in server mode (program === server initial).
  const skipFirstRef = useRef(true)
  // Latest save callback kept in a ref (synced in an effect, not during render)
  // so the persist effect can fire on `program` changes only, without `save` in deps.
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  }, [save])

  // Load from localStorage once on client (localStorage mode only).
  useEffect(() => {
    if (serverMode) return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Program
        if (parsed?.sessions?.length) {
          // Legacy slots had `{ id, src, label, segments?, color? }` at the top
          // level; new shape nests `asana: { id, src, label }`. Migrate inline.
          const migrated: Program = {
            ...parsed,
            schedule: normalizeSchedule(parsed.schedule),
            sessions: parsed.sessions.map((s) => {
              const slots = s.slots.map(normalizeSlot)
              // Backfill stable slot ids for programs saved before they existed.
              const slotIds =
                Array.isArray(s.slotIds) && s.slotIds.length === slots.length
                  ? s.slotIds
                  : makeUids(slots.length)
              return { ...s, slots, slotIds }
            }),
          }
          // Hydrating from localStorage on mount — defaults rendered SSR-side,
          // then we swap to the persisted program on the client.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setProgram(migrated)
        }
      }
    } catch {
      // ignore — corrupted localStorage, keep default
    }
    setHydrated(true)
  }, [serverMode])

  // Persist on every change after hydration. Server mode → debounced save action
  // (+ saveState); localStorage mode → synchronous write.
  useEffect(() => {
    if (!hydrated) return
    if (serverMode) {
      // First run = mounting with the server initial — nothing to save yet.
      if (skipFirstRef.current) {
        skipFirstRef.current = false
        return
      }
      const snapshot = program
      setSaveState('saving')
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        const seq = ++seqRef.current
        const fn = saveRef.current
        if (!fn) return
        fn(snapshot)
          .then((res) => {
            if (seq !== seqRef.current) return // superseded by a newer save
            const ok = res?.ok === true || res?.status === 'ok'
            setSaveState(ok ? 'saved' : 'error')
          })
          .catch(() => {
            if (seq === seqRef.current) setSaveState('error')
          })
      }, AUTOSAVE_DEBOUNCE_MS)
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current)
      }
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(program))
    } catch {
      // quota or private mode — silently ignore
    }
  }, [program, hydrated, serverMode])

  function setTitle(title: string) {
    setProgram((p) => ({ ...p, title }))
  }

  function setProgramDescription(description: string) {
    setProgram((p) => ({ ...p, description: description || undefined }))
  }

  function addSession() {
    setProgram((p) => ({
      ...p,
      sessions: [...p.sessions, newSession(`Сет ${p.sessions.length + 1}`)],
    }))
  }

  function removeSession(sessionId: string) {
    setProgram((p) => ({
      ...p,
      sessions: p.sessions.length > 1 ? p.sessions.filter((s) => s.id !== sessionId) : p.sessions,
    }))
  }

  // Reorder sessions (drag-n-drop): move `activeId` to `overId`'s position.
  function reorderSessions(activeId: string, overId: string) {
    if (activeId === overId) return
    setProgram((p) => {
      const from = p.sessions.findIndex((s) => s.id === activeId)
      const to = p.sessions.findIndex((s) => s.id === overId)
      if (from === -1 || to === -1 || from === to) return p
      const sessions = p.sessions.slice()
      const [moved] = sessions.splice(from, 1)
      sessions.splice(to, 0, moved)
      return { ...p, sessions }
    })
  }

  function setSlotsCount(sessionId: string, count: number) {
    const next = Math.max(MIN_SLOTS, Math.min(MAX_SLOTS, count))
    setProgram((p) => ({
      ...p,
      sessions: p.sessions.map((s) => {
        if (s.id !== sessionId) return s
        if (next > s.slots.length) {
          const add = next - s.slots.length
          return {
            ...s,
            slots: [...s.slots, ...emptySlots(add)],
            slotIds: [...s.slotIds, ...makeUids(add)],
          }
        }
        // Shrinking — drop trailing slots even if filled. The user-facing UI is
        // expected to confirm before this is called when slots will be lost.
        return { ...s, slots: s.slots.slice(0, next), slotIds: s.slotIds.slice(0, next) }
      }),
    }))
  }

  function renameSession(sessionId: string, title: string) {
    setProgram((p) => ({
      ...p,
      sessions: p.sessions.map((s) => (s.id === sessionId ? { ...s, title } : s)),
    }))
  }

  function setSessionDescription(sessionId: string, description: string) {
    setProgram((p) => ({
      ...p,
      sessions: p.sessions.map((s) =>
        s.id === sessionId ? { ...s, description: description || undefined } : s,
      ),
    }))
  }

  /**
   * Add an asana to the first slot without one (scan sessions top-down, slots
   * left-to-right). Preserves any segments / color the slot already has — so
   * a pre-filled breath-only slot becomes a fully-filled slot.
   * If every slot already has an asana, appends a fresh slot to the *last*
   * session (capped by MAX_SLOTS).
   */
  function addToFirstEmpty(asana: Asana): boolean {
    const snapshot: SlotAsana = { id: asana.id, src: asana.src, label: asana.label }
    let done = false
    setProgram((p) => {
      const sessions = p.sessions.map((s) => {
        if (done) return s
        const idx = s.slots.findIndex(isEmptySlot)
        if (idx === -1) return s
        const slots = s.slots.slice()
        const existing = slots[idx]
        slots[idx] = { ...(existing ?? {}), asana: snapshot }
        done = true
        return { ...s, slots }
      })
      if (done) return { ...p, sessions }
      const last = sessions[sessions.length - 1]
      if (!last || last.slots.length >= MAX_SLOTS) return p
      const extended = sessions.map((s, i) =>
        i === sessions.length - 1
          ? { ...s, slots: [...s.slots, { asana: snapshot }], slotIds: [...s.slotIds, makeUid()] }
          : s,
      )
      done = true
      return { ...p, sessions: extended }
    })
    return done
  }

  function setSlot(sessionId: string, slotIndex: number, asana: Asana | null) {
    setProgram((p) => ({
      ...p,
      sessions: p.sessions.map((s) => {
        if (s.id !== sessionId) return s
        const slots = s.slots.slice()
        const existing = slots[slotIndex]
        if (asana) {
          slots[slotIndex] = { ...(existing ?? {}), asana: { id: asana.id, src: asana.src, label: asana.label } }
        } else if (existing?.segments?.length) {
          // Clearing the asana but the slot has breath segments — keep them.
          const { asana: _drop, color: _dropColor, ...rest } = existing
          slots[slotIndex] = { ...rest }
        } else {
          slots[slotIndex] = null
        }
        return { ...s, slots }
      }),
    }))
  }

  function moveSlot(
    fromSessionId: string,
    fromIndex: number,
    toSessionId: string,
    toIndex: number,
  ) {
    setProgram((p) => {
      // Same session → REORDER: pull the slot out and insert it at the target,
      // sliding the slots in between (not a swap).
      if (fromSessionId === toSessionId) {
        if (fromIndex === toIndex) return p
        return {
          ...p,
          sessions: p.sessions.map((s) => {
            if (s.id !== fromSessionId) return s
            if (!s.slots[fromIndex]) return s
            const slots = s.slots.slice()
            const slotIds = s.slotIds.slice()
            const [moved] = slots.splice(fromIndex, 1)
            const [movedId] = slotIds.splice(fromIndex, 1)
            slots.splice(toIndex, 0, moved)
            slotIds.splice(toIndex, 0, movedId)
            return { ...s, slots, slotIds }
          }),
        }
      }
      // Cross-session → move into the target slot (swap with whatever is there).
      // Ids travel with their content, so swap them alongside the slots.
      const sessions = p.sessions.map((s) => ({ ...s, slots: s.slots.slice(), slotIds: s.slotIds.slice() }))
      const from = sessions.find((s) => s.id === fromSessionId)
      const to = sessions.find((s) => s.id === toSessionId)
      if (!from || !to) return p
      const moving = from.slots[fromIndex]
      if (!moving) return p
      const displaced = to.slots[toIndex] ?? null
      to.slots[toIndex] = moving
      from.slots[fromIndex] = displaced
      const movingId = from.slotIds[fromIndex]
      from.slotIds[fromIndex] = to.slotIds[toIndex]
      to.slotIds[toIndex] = movingId
      return { ...p, sessions }
    })
  }

  function clearProgram() {
    // Server mode: keep the same id/title so autosave still targets this DB row;
    // only reset the sessions. localStorage mode: full fresh default.
    setProgram((p) =>
      serverMode ? { id: p.id, title: p.title, sessions: [newSession('Сет 1')] } : defaultProgram(),
    )
  }

  function setSlotColor(sessionId: string, slotIndex: number, color: SlotColor | null) {
    setProgram((p) => ({
      ...p,
      sessions: p.sessions.map((s) => {
        if (s.id !== sessionId) return s
        const slot = s.slots[slotIndex]
        // Colour is meaningful only for slots with an asana — ignore otherwise.
        if (!slot || !slot.asana) return s
        const slots = s.slots.slice()
        slots[slotIndex] = { ...slot, color: color ?? undefined }
        return { ...s, slots }
      }),
    }))
  }

  function setSlotSide(sessionId: string, slotIndex: number, side: SlotSide | null) {
    setProgram((p) => ({
      ...p,
      sessions: p.sessions.map((s) => {
        if (s.id !== sessionId) return s
        const slot = s.slots[slotIndex]
        // Side is meaningful only for slots with an asana.
        if (!slot || !slot.asana) return s
        const slots = s.slots.slice()
        slots[slotIndex] = { ...slot, side: side ?? undefined }
        return { ...s, slots }
      }),
    }))
  }

  function setSegments(sessionId: string, slotIndex: number, segments: Segment[]) {
    setProgram((p) => ({
      ...p,
      sessions: p.sessions.map((s) => {
        if (s.id !== sessionId) return s
        const slots = s.slots.slice()
        const slot = slots[slotIndex]
        const clean = segments.slice(0, MAX_SEGMENTS).filter((seg) => seg.count > 0)
        if (clean.length === 0) {
          // Clearing segments — drop the slot entirely if no asana left.
          if (!slot || !slot.asana) slots[slotIndex] = null
          else slots[slotIndex] = { asana: slot.asana, color: slot.color }
        } else {
          slots[slotIndex] = { ...(slot ?? {}), segments: clean }
        }
        return { ...s, slots }
      }),
    }))
  }

  // ─── Schedule grid (optional table above the description) ──────────
  function setScheduleEnabled(enabled: boolean) {
    setProgram((p) => ({
      ...p,
      schedule: { ...(p.schedule ?? emptySchedule()), enabled },
    }))
  }

  function setScheduleDays(days: number) {
    const n = Math.max(SCHEDULE_MIN_DAYS, Math.min(SCHEDULE_MAX_DAYS, Math.round(days)))
    setProgram((p) => {
      const cur = p.schedule ?? emptySchedule(true)
      // Shrinking → trim each row so storage doesn't keep orphaned cells.
      const cells: Record<string, ScheduleCell[]> = {}
      for (const [k, arr] of Object.entries(cur.cells)) cells[k] = arr.slice(0, n)
      return { ...p, schedule: { ...cur, days: n, cells } }
    })
  }

  function addScheduleRow() {
    setProgram((p) => {
      const cur = p.schedule ?? emptySchedule(true)
      const existing = cur.rows ?? []
      return { ...p, schedule: { ...cur, rows: [...existing, newScheduleRow(pickActivityColor(existing))] } }
    })
  }

  function removeScheduleRow(rowId: string) {
    setProgram((p) => {
      const cur = p.schedule ?? emptySchedule(true)
      const cells = { ...cur.cells }
      delete cells[rowId]
      return { ...p, schedule: { ...cur, cells, rows: (cur.rows ?? []).filter((r) => r.id !== rowId) } }
    })
  }

  function renameScheduleRow(rowId: string, label: string) {
    const clean = label.slice(0, 24)
    setProgram((p) => {
      const cur = p.schedule ?? emptySchedule(true)
      return { ...p, schedule: { ...cur, rows: (cur.rows ?? []).map((r) => (r.id === rowId ? { ...r, label: clean } : r)) } }
    })
  }

  function setScheduleCell(sessionId: string, dayIndex: number, color: SlotColor | null) {
    setProgram((p) => {
      const cur = p.schedule ?? emptySchedule(true)
      if (dayIndex < 0 || dayIndex >= cur.days) return p
      const row = (cur.cells[sessionId] ?? []).slice()
      while (row.length <= dayIndex) row.push(null)
      row[dayIndex] = color
      // Drop a fully-empty row to keep the persisted object tidy.
      const isEmpty = row.every((c) => c == null)
      const cells = { ...cur.cells }
      if (isEmpty) delete cells[sessionId]
      else cells[sessionId] = row
      return { ...p, schedule: { ...cur, cells } }
    })
  }

  return {
    program,
    hydrated,
    saveState,
    setTitle,
    setProgramDescription,
    addSession,
    removeSession,
    renameSession,
    setSessionDescription,
    setSlot,
    moveSlot,
    addToFirstEmpty,
    clearProgram,
    setSlotsCount,
    setSegments,
    setSlotColor,
    setSlotSide,
    reorderSessions,
    setScheduleEnabled,
    setScheduleDays,
    setScheduleCell,
    addScheduleRow,
    removeScheduleRow,
    renameScheduleRow,
  }
}
