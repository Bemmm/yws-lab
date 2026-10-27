'use client'
/* eslint-disable max-lines, max-lines-per-function -- builder is a single cohesive UI; splitting hurts colocation more than it helps right now */

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useDndContext,
  useDraggable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DraggableAttributes,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
  type Modifier,
} from '@dnd-kit/core'
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities'
import { SortableContext, useSortable, rectSortingStrategy, verticalListSortingStrategy } from '@dnd-kit/sortable'
import Link from 'next/link'
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useStrings } from './_lib/strings'
import { ASANAS, type Asana, type AsanaLevel } from './_lib/asana-manifest'
import {
  MAX_SEGMENTS,
  MAX_SLOTS,
  MIN_SLOTS,
  SCHEDULE_MAX_DAYS,
  SCHEDULE_MIN_DAYS,
  useProgram,
  type Program,
  type SaveState,
  type ScheduleCell,
  type ScheduleRow,
  type Segment,
  type SegmentType,
  type Slot,
  type SlotColor,
  type SlotSide,
} from './_lib/use-program'

/* ─── Injected config (Papaya wires its BE/i18n; standalone wires localStorage) ─ */
type ShareConfig = {
  initialToken: string | null
  enable: (programId: string) => Promise<{ status?: string; shareToken?: string | null }>
  disable: (programId: string) => Promise<unknown>
}
type BuilderBrand = { href: string; label: string; icon: ReactNode }
export type BuilderClientProps = {
  /** Server-loaded program (Papaya). Omit → standalone localStorage mode. */
  initialProgram?: Program
  /** Persist callback (Papaya autosave). Omit → localStorage only. */
  save?: (program: Program) => Promise<{ status?: string; ok?: boolean }>
  /** Public-share control (Papaya). Omit → no share button. */
  share?: ShareConfig
  /** Builder → preview link, computed from the (client-side) program id. */
  previewHref: (programId?: string) => string
  /** Breadcrumb identity (icon + label + home href). */
  brand: BuilderBrand
}

/* ─── Paint palette (footer-tint colours) ─────────────────────────── */
const PAINT_COLORS: { key: SlotColor; swatch: string; chipBg: string; chipText: string }[] = [
  { key: 'amber', swatch: 'bg-amber-300', chipBg: 'bg-amber-200', chipText: 'text-amber-900' },
  { key: 'emerald', swatch: 'bg-emerald-300', chipBg: 'bg-emerald-200', chipText: 'text-emerald-900' },
  { key: 'orange', swatch: 'bg-orange-300', chipBg: 'bg-orange-200', chipText: 'text-orange-900' },
  { key: 'sky', swatch: 'bg-sky-300', chipBg: 'bg-sky-200', chipText: 'text-sky-900' },
  { key: 'violet', swatch: 'bg-violet-300', chipBg: 'bg-violet-200', chipText: 'text-violet-900' },
  { key: 'rose', swatch: 'bg-rose-300', chipBg: 'bg-rose-200', chipText: 'text-rose-900' },
]
const COLOR_BY_KEY = Object.fromEntries(PAINT_COLORS.map((c) => [c.key, c])) as Record<SlotColor, typeof PAINT_COLORS[number]>
// Set rows fill orange; each custom activity row carries its own colour.
const SCHEDULE_FILL: SlotColor = 'orange'

// Pin the drag overlay's centre to the pointer. dnd-kit positions the overlay at
// the dragged node's measured origin + delta; in this layout that origin lands
// far from the cursor, so we recompute it from the pointer's viewport coords.
const snapCenterToCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (!draggingNodeRect || !activatorEvent) return transform
  const e = activatorEvent as PointerEvent
  if (typeof e.clientX !== 'number' || typeof e.clientY !== 'number') return transform
  return {
    ...transform,
    x: transform.x + (e.clientX - draggingNodeRect.left) - draggingNodeRect.width / 2,
    y: transform.y + (e.clientY - draggingNodeRect.top) - draggingNodeRect.height / 2,
  }
}

// Library drop: fade + shrink the ghost *in place* (at the pointer where it was
// released) instead of flying it back to the source card — whose rect mis-measures
// to the top-left in this layout. Keyframes start from the overlay's live
// transform (snap-adjusted), so it settles right where you dropped it.
const libraryDropAnimation: DropAnimation = {
  duration: 170,
  easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
  keyframes: ({ transform }) => {
    const t = `translate3d(${transform.initial.x}px, ${transform.initial.y}px, 0)`
    return [
      { opacity: 1, transform: `${t} scale(1)` },
      { opacity: 0, transform: `${t} scale(0.82)` },
    ]
  },
}

/**
 * Workout-builder client. Library on the left (tabs L1-L6 + search + grid),
 * sessions stack on the right (each session has 6 drop-slots). Drag library
 * → slot to fill. Drag one slot → another slot to move/swap. Click a filled
 * slot to clear it.
 */

const LEVELS: AsanaLevel[] = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'Other']

type DragData =
  | { source: 'library'; asanaId: string }
  | { source: 'slot'; sessionId: string; slotIndex: number; asanaId: string }

type SessionDragData = { type: 'session'; sessionId: string }
type AnyDragData = DragData | SessionDragData

// Session drags only collide with other sessions (not the inner asana slots);
// asana drags use rect-intersection against the slots.
const builderCollision: CollisionDetection = (args) => {
  const isSession = (c: { data: { current?: unknown } }) =>
    (c.data.current as { type?: string } | undefined)?.type === 'session'
  const active = args.active.data.current as { type?: string; source?: string } | undefined
  if (active?.type === 'session') {
    // Session drag → snap only to other sessions.
    return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(isSession) })
  }
  // Asana drag → only the slots, never the session drop zones.
  const slots = args.droppableContainers.filter((c) => !isSession(c))
  // Reordering an existing slot → closestCenter drives the sortable push.
  if (active?.source === 'slot') return closestCenter({ ...args, droppableContainers: slots })
  // Dropping a fresh asana from the library → land in the slot under the POINTER.
  // pointerWithin uses the live pointer coords, so it works even when the dragged
  // library card's own rect is mis-measured (it can read as 0,0 in this layout,
  // which made rectIntersection collide near the top-left and miss every slot).
  const hits = pointerWithin({ ...args, droppableContainers: slots })
  return hits.length ? hits : rectIntersection({ ...args, droppableContainers: slots })
}

// The floating paint dock is fixed to the viewport bottom-centre; a segments
// popover opening below a low slot would land behind it. Open popovers register
// here so the dock hides while one is open (you can't paint + edit segments at
// once — clicking a slot in paint mode paints it, never opens the popover).
const PaintDockGuardContext = createContext<{ open: () => void; close: () => void }>({
  open: () => {},
  close: () => {},
})

/* ─── Mobile library sheet (iOS-style) ─────────────────────────────
   На <lg библиотека асан живёт в фиксированном bottom-sheet с грабером:
   тянешь верхнюю кромку вверх/вниз — sheet растёт/сжимается (как iOS detents,
   но непрерывно). Высота — px-state; main-колонка и paint-dock получают
   динамический отступ снизу, чтобы sheet их не перекрывал. */
const DESKTOP_MQ = '(min-width: 1024px)' // = tailwind lg
function subscribeDesktop(cb: () => void) {
  const mq = window.matchMedia(DESKTOP_MQ)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const getIsDesktop = () => window.matchMedia(DESKTOP_MQ).matches
// SSR-снимок = desktop (sheet не рендерится при первой отрисовке на сервере).
const getIsDesktopServer = () => true

const SHEET_MIN = 92 // грабер + заголовок библиотеки остаются видимыми
const SHEET_MAX_VH = 0.85

export function BuilderClient({
  initialProgram,
  save,
  share,
  previewHref,
  brand,
}: BuilderClientProps) {
  const t = useStrings()
  // initialProgram present → seed + (optional) autosave via injected `save`;
  // absent → localStorage mode (hook hydrates from localStorage on mount).
  const { program, hydrated, saveState, setTitle, setProgramDescription, addSession, removeSession, renameSession, setSessionDescription, setSlot, moveSlot, addToFirstEmpty, clearProgram, setSlotsCount, setSegments, setSlotColor, setSlotSide, reorderSessions, setScheduleEnabled, setScheduleDays, setScheduleCell, addScheduleRow, removeScheduleRow, renameScheduleRow } = useProgram(
    initialProgram ? { initial: initialProgram, save } : undefined,
  )
  const [paintColor, setPaintColor] = useState<SlotColor | 'clear' | null>(null)
  const [isPainting, setIsPainting] = useState(false)
  const paintMode = paintColor !== null

  // Count of open segments popovers → hide the paint dock while any is open.
  const [openPopovers, setOpenPopovers] = useState(0)
  const dockGuard = useMemo(
    () => ({
      open: () => setOpenPopovers((n) => n + 1),
      close: () => setOpenPopovers((n) => Math.max(0, n - 1)),
    }),
    [],
  )

  // Mobile library bottom-sheet: высота в px + drag-resize за верхнюю кромку.
  const isDesktop = useSyncExternalStore(subscribeDesktop, getIsDesktop, getIsDesktopServer)
  const [sheetH, setSheetH] = useState(320)
  const sheetDragRef = useRef<{ startY: number; startH: number } | null>(null)
  // #2 — desktop library width is drag-resizable (тянешь левый край → больше
  // колонок). Раньше каталог можно было расширять — вернули.
  const [libWidth, setLibWidth] = useState(360)
  const [libDragging, setLibDragging] = useState(false)
  const libDragRef = useRef<{ startX: number; startW: number } | null>(null)
  // The 2-column shell grid; resized by mutating its style directly during drag
  // (no per-frame React re-render of the 1235-item library — big perf win).
  const libGridRef = useRef<HTMLDivElement>(null)
  const pendingLibWidthRef = useRef(360)
  function onLibHandleDown(e: React.PointerEvent) {
    e.preventDefault()
    libDragRef.current = { startX: e.clientX, startW: libWidth }
    setLibDragging(true)
    document.body.style.cursor = 'col-resize'
    let raf = 0
    function move(ev: PointerEvent) {
      const d = libDragRef.current
      if (!d) return
      // drag left (clientX↓) → wider library
      const w = Math.max(280, Math.min(760, d.startW + (d.startX - ev.clientX)))
      pendingLibWidthRef.current = w
      // Coalesce to one DOM write per frame; mutate the grid template directly
      // so React doesn't reconcile the whole library on every pointermove.
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0
          if (libGridRef.current) libGridRef.current.style.gridTemplateColumns = `minmax(0,1fr) ${pendingLibWidthRef.current}px`
        })
      }
    }
    function up() {
      libDragRef.current = null
      setLibDragging(false)
      document.body.style.cursor = ''
      if (raf) cancelAnimationFrame(raf)
      setLibWidth(pendingLibWidthRef.current) // commit once at the end
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  useEffect(() => {
    // Стартовая высота ~38vh — одноразовая гидрация после маунта (SSR не знает
    // viewport; initializer useState бежит и на сервере).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSheetH(Math.round(window.innerHeight * 0.38))
  }, [])
  function onSheetHandleDown(e: React.PointerEvent) {
    e.preventDefault()
    sheetDragRef.current = { startY: e.clientY, startH: sheetH }
    function onMove(ev: PointerEvent) {
      const d = sheetDragRef.current
      if (!d) return
      const max = Math.round(window.innerHeight * SHEET_MAX_VH)
      setSheetH(Math.min(max, Math.max(SHEET_MIN, d.startH + (d.startY - ev.clientY))))
    }
    function onUp() {
      sheetDragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  // End drag-paint anywhere on the page (mouse up outside any slot still ends the stroke).
  useEffect(() => {
    if (!isPainting) return
    function up() { setIsPainting(false) }
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [isPainting])

  function applyPaint(sessionId: string, slotIndex: number) {
    if (paintColor === null) return
    if (paintColor === 'clear') setSlotColor(sessionId, slotIndex, null)
    else setSlotColor(sessionId, slotIndex, paintColor)
  }
  const [tab, setTab] = useState<'all' | AsanaLevel>('all')
  const [query, setQuery] = useState('')
  const [activeDrag, setActiveDrag] = useState<DragData | null>(null)
  // Source of the drag that just ran (persists through drop, unlike activeDrag).
  // Drives dropAnimation: null for library drops (their source rect mis-measures
  // → fly to top-left), default settle animation for slot reorders.
  const [lastDragSource, setLastDragSource] = useState<DragData['source'] | undefined>(undefined)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const filtered = useMemo(() => {
    let list: Asana[] = ASANAS
    if (tab !== 'all') list = list.filter((a) => a.level === tab)
    const q = query.trim().toLowerCase()
    if (q) list = list.filter((a) => a.label.toLowerCase().includes(q) || a.id.toLowerCase().includes(q))
    return list
  }, [tab, query])

  const dragAsana = activeDrag ? ASANAS.find((a) => a.id === activeDrag.asanaId) ?? null : null

  function onDragStart(e: DragStartEvent) {
    const data = e.active.data.current as AnyDragData | undefined
    // Overlay only for asana drags; session drags move via their own transform.
    if (data && 'source' in data) {
      setActiveDrag(data)
      setLastDragSource(data.source)
    }
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveDrag(null)
    const active = e.active.data.current as AnyDragData | undefined
    if (!active) return
    if ('type' in active && active.type === 'session') {
      const over = e.over?.data.current as { sessionId?: string } | undefined
      if (over?.sessionId) reorderSessions(active.sessionId, over.sessionId)
      return
    }
    const to = e.over?.data.current as { sessionId: string; slotIndex: number } | undefined
    if (!('source' in active) || !to) return
    if (active.source === 'library') {
      const asana = ASANAS.find((a) => a.id === active.asanaId)
      if (asana) setSlot(to.sessionId, to.slotIndex, asana)
    } else {
      moveSlot(active.sessionId, active.slotIndex, to.sessionId, to.slotIndex)
    }
  }

  return (
    <PaintDockGuardContext.Provider value={dockGuard}>
    <DndContext id="workout-builder-dnd" sensors={sensors} collisionDetection={builderCollision} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      {/* Две карточки на сером shell'е вместо одной main-карточки. Flush к верху/
          левому краю (как обычная main-карточка), отступ только справа/снизу.
          Mobile: карточка full-bleed без скруглений — как main-card остальных
          страниц кабинета. */}
      <div className="min-h-full lg:h-full lg:p-0">
        <div
          ref={libGridRef}
          className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-3 items-start lg:h-full lg:items-stretch"
          style={isDesktop ? { gridTemplateColumns: `minmax(0,1fr) ${libWidth}px` } : undefined}
        >
          {/* Left card: the builder itself — header фикс, сессии скроллятся */}
          <section className="min-w-0 bg-background-subtle border-y border-border lg:border rounded-none lg:rounded-2xl overflow-hidden lg:flex lg:flex-col lg:min-h-0">
            <ProgramHeader
              title={program.title}
              onTitle={setTitle}
              onAdd={addSession}
              onClear={clearProgram}
              saveState={saveState}
              programId={program.id}
              share={share}
              previewHref={previewHref}
              brand={brand}
              scheduleEnabled={program.schedule?.enabled ?? false}
              onToggleSchedule={() => setScheduleEnabled(!(program.schedule?.enabled ?? false))}
            />
            {/* Extra bottom padding so the segments popover (opens below its row)
                clears the floating paint dock and stays reachable for the last set.
                On mobile the padding tracks the library sheet height instead. */}
            <div
              className="p-4 sm:p-5 pb-40 sm:pb-48 space-y-4 lg:flex-1 lg:min-h-0 lg:overflow-y-auto"
              // sheet + paint-dock над ним (~56px) + зазор — чтобы dock не
              // ложился на последний ряд карточек при прокрутке до конца.
              style={isDesktop ? undefined : { paddingBottom: sheetH + 96 }}
            >
              {/* Program-wide plan — auto-grow note above the sets. */}
              <AutoGrowNote
                value={program.description ?? ''}
                onChange={setProgramDescription}
                placeholder={t.workoutBuilder.program.descriptionPlaceholder}
                wrapperClassName="max-w-7xl mx-auto w-full rounded-xl border border-border bg-surface px-4 py-3"
                textClassName="text-sm leading-relaxed text-foreground-secondary"
              />
              {/* Schedule grid — opt-in table below the description (toggle in
                  the header). Rows auto-track the sets; cells painted by colour. */}
              {program.schedule?.enabled && (
                <ScheduleTable
                  days={program.schedule.days}
                  sessions={program.sessions.map((s, i) => ({ id: s.id, label: s.title.trim() || `${t.workoutBuilder.schedule.setPrefix}${i + 1}` }))}
                  cells={program.schedule.cells}
                  rows={program.schedule.rows ?? []}
                  onSetCell={setScheduleCell}
                  onSetDays={setScheduleDays}
                  onAddRow={addScheduleRow}
                  onRemoveRow={removeScheduleRow}
                  onRenameRow={renameScheduleRow}
                />
              )}
              <SortableContext items={program.sessions.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                {program.sessions.map((s, i) => (
                  <SessionCard
                    key={s.id}
                    index={i + 1}
                    title={s.title}
                    description={s.description}
                    slots={s.slots}
                    slotIds={s.slotIds}
                    onRename={(t) => renameSession(s.id, t)}
                    onSetDescription={(text) => setSessionDescription(s.id, text)}
                    onRemove={() => removeSession(s.id)}
                    canRemove={program.sessions.length > 1}
                    sessionId={s.id}
                    onClearSlot={(idx) => setSlot(s.id, idx, null)}
                    onSetSlotsCount={(n) => setSlotsCount(s.id, n)}
                    onSetSegments={(idx, segs) => setSegments(s.id, idx, segs)}
                    onSetSide={(idx, side) => setSlotSide(s.id, idx, side)}
                    paintMode={paintMode}
                    isPainting={isPainting}
                    onPaintStart={(idx) => { setIsPainting(true); applyPaint(s.id, idx) }}
                    onPaintEnter={(idx) => { if (isPainting) applyPaint(s.id, idx) }}
                  />
                ))}
              </SortableContext>
            </div>
          </section>

          {/* Right card: asana library — desktop aside; on mobile the library
              lives in the bottom sheet (below), so the in-flow card is hidden.
              Wrapper is `relative` WITHOUT overflow so the resize grip in the
              gutter isn't clipped; the inner aside keeps overflow-hidden so the
              scrolling library content stays inside the rounded corners. */}
          <div className="relative hidden lg:flex lg:min-h-0">
            {/* Drag-resize handle на левом крае каталога (#2). Подсветка на hover
                и во время drag: тонкая папайя-полоса + grip-«таблетка» по центру. */}
            <div
              onPointerDown={onLibHandleDown}
              className={`absolute left-0 top-0 bottom-0 -ml-2 w-3 z-20 cursor-col-resize group/lh touch-none ${libDragging ? 'is-dragging' : ''}`}
              role="separator"
              aria-orientation="vertical"
              aria-label={t.workoutBuilder.library.title}
            >
              {/* full-height bar — appears on hover, locks bright while dragging */}
              <span
                className={`absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 rounded-full transition-all duration-150 ${
                  libDragging
                    ? 'bg-primary w-1 shadow-[0_0_0_3px_rgba(234,88,12,0.18)]'
                    : 'bg-transparent group-hover/lh:bg-primary/60 group-hover/lh:w-1'
                }`}
                aria-hidden="true"
              />
              {/* center grip capsule — persistent affordance: always visible so the
                  edge reads as draggable, brightens on hover, solid while dragging. */}
              <span
                className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center gap-[3px] h-9 w-3.5 rounded-full border shadow-sm transition-all duration-150 ${
                  libDragging
                    ? 'bg-primary border-primary scale-105'
                    : 'bg-surface border-border-strong group-hover/lh:border-primary group-hover/lh:scale-105'
                }`}
                aria-hidden="true"
              >
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={`w-[3px] h-[3px] rounded-full transition-colors ${
                      libDragging ? 'bg-white' : 'bg-foreground-muted group-hover/lh:bg-primary'
                    }`}
                  />
                ))}
              </span>
            </div>
            <aside className="flex-1 flex flex-col min-w-0 lg:min-h-0 bg-background-subtle border border-border rounded-2xl overflow-hidden">
              <LibraryPanel
                tab={tab}
                onTab={setTab}
                query={query}
                onQuery={setQuery}
                hydrated={hydrated}
                filtered={filtered}
                onPick={addToFirstEmpty}
              />
            </aside>
          </div>
        </div>
      </div>

      {/* Mobile: библиотека асан как iOS-style bottom-sheet — тянешь грабер
          вверх/вниз, sheet меняет высоту. Рендерится внутри DndContext, чтобы
          drag из библиотеки в слоты продолжал работать. */}
      <div
        className="lg:hidden fixed inset-x-0 bottom-0 z-40 flex flex-col bg-background-subtle border-t border-border rounded-t-2xl shadow-[0_-16px_48px_-16px_rgba(15,23,42,0.35)] overflow-hidden"
        style={{ height: sheetH }}
      >
        <div
          onPointerDown={onSheetHandleDown}
          className="shrink-0 flex items-center justify-center py-2 cursor-grab active:cursor-grabbing touch-none select-none"
          role="separator"
          aria-orientation="horizontal"
          aria-label={t.workoutBuilder.library.title}
        >
          <span className="w-10 h-1 rounded-full bg-border-strong" aria-hidden="true" />
        </div>
        <LibraryPanel
          tab={tab}
          onTab={setTab}
          query={query}
          onQuery={setQuery}
          hydrated={hydrated}
          filtered={filtered}
          onPick={addToFirstEmpty}
        />
      </div>

      {/* Portaled to <body> so the overlay's fixed positioning is relative to the
          viewport, not clipped/offset by the library's overflow-hidden ancestor. */}
      {/* Library drop → fade+shrink in place (custom animation, no corner-float).
          Slot reorder → default settle (its source rect is correct). */}
      <DragOverlay modifiers={[snapCenterToCursor]} dropAnimation={lastDragSource === 'library' ? libraryDropAnimation : undefined}>
        {dragAsana ? <AsanaThumb asana={dragAsana} dragOverlay /> : null}
      </DragOverlay>

      {/* Floating paint dock — fixed to the bottom of the viewport so it's always
          one click away while you scroll through long programs. Hidden while a
          segments popover is open so it never lands on top of it. */}
      <div
        className={`fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 pointer-events-none transition-opacity duration-150 ${
          openPopovers > 0 ? 'opacity-0 invisible' : 'opacity-100'
        }`}
        // Mobile: dock сидит над library-sheet (его высота динамическая).
        style={isDesktop ? undefined : { bottom: sheetH + 12 }}
      >
        <div className="pointer-events-auto">
          <PaintToolbar
            paintColor={paintColor}
            onSelect={setPaintColor}
            onDone={() => { setPaintColor(null); setIsPainting(false) }}
          />
        </div>
      </div>
    </DndContext>
    </PaintDockGuardContext.Provider>
  )
}

/* ─── Paint toolbar ──────────────────────────────────────────────── */
function PaintToolbar({
  paintColor,
  onSelect,
  onDone,
}: {
  paintColor: SlotColor | 'clear' | null
  onSelect: (c: SlotColor | 'clear' | null) => void
  onDone: () => void
}) {
  const t = useStrings()
  const active = paintColor !== null
  return (
    <div className="inline-flex items-center gap-2 flex-wrap rounded-full border border-border bg-surface/95 backdrop-blur-md px-3 py-2 shadow-xl">
      <span className="font-mono text-[10px] uppercase tracking-wider text-foreground-muted mr-1">
        {t.workoutBuilder.paint.label}
      </span>
      <div className="flex items-center gap-1">
        {PAINT_COLORS.map((c) => {
          const selected = paintColor === c.key
          const label = t.workoutBuilder.paint.colors[c.key]
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onSelect(selected ? null : c.key)}
              aria-label={label}
              aria-pressed={selected}
              title={label}
              className={`w-6 h-6 rounded-full ${c.swatch} transition ${
                selected ? 'ring-2 ring-offset-2 ring-foreground scale-110' : 'hover:scale-105'
              }`}
            />
          )
        })}
        <button
          type="button"
          onClick={() => onSelect(paintColor === 'clear' ? null : 'clear')}
          aria-label={t.workoutBuilder.paint.removeColor}
          aria-pressed={paintColor === 'clear'}
          title={t.workoutBuilder.paint.removeColor}
          className={`w-6 h-6 rounded-full border-2 border-dashed border-foreground-muted bg-surface inline-flex items-center justify-center transition ${
            paintColor === 'clear' ? 'ring-2 ring-offset-2 ring-foreground scale-110' : 'hover:scale-105'
          }`}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      {active && (
        <>
          <span className="text-xs text-foreground-muted mx-1 hidden sm:inline">
            {t.workoutBuilder.paint.hintAction}
          </span>
          <button
            type="button"
            onClick={onDone}
            className="ml-auto h-7 px-3 inline-flex items-center justify-center rounded-md bg-foreground text-background text-xs font-semibold hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            {t.workoutBuilder.paint.done}
          </button>
        </>
      )}
    </div>
  )
}

/* ─── Program header ─────────────────────────────────────────────── */
// Autosave-индикатор (server mode). i18n строк — follow-up (пока RU, §artifact-lang).
function SaveIndicator({ state }: { state?: SaveState }) {
  if (!state || state === 'idle') return null
  const map: Record<Exclude<SaveState, 'idle'>, { label: string; cls: string; dot: string }> = {
    saving: { label: 'Сохранение…', cls: 'text-foreground-muted', dot: 'bg-amber-400 animate-pulse' },
    saved: { label: 'Сохранено', cls: 'text-foreground-muted', dot: 'bg-emerald-500' },
    error: { label: 'Не сохранено', cls: 'text-rose-600', dot: 'bg-rose-500' },
  }
  const s = map[state]
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.cls}`} role="status" aria-live="polite">
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {s.label}
    </span>
  )
}

function ProgramHeader({
  title,
  onTitle,
  onAdd,
  onClear,
  saveState,
  programId,
  share,
  previewHref,
  brand,
  scheduleEnabled,
  onToggleSchedule,
}: {
  title: string
  onTitle: (t: string) => void
  onAdd: () => void
  onClear: () => void
  saveState?: SaveState
  programId?: string
  share?: ShareConfig
  previewHref: (programId?: string) => string
  brand: BuilderBrand
  scheduleEnabled: boolean
  onToggleSchedule: () => void
}) {
  const t = useStrings()
  const p = t.workoutBuilder.program
  // CardHeader-полоса как на других страницах: иконка + breadcrumb
  // «Тренировки / <название программы>» (название редактируется инлайн).
  return (
    <header className="shrink-0 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 sm:px-6 py-3 min-h-[60px] border-b border-border">
      <nav aria-label="breadcrumb" className="flex items-center gap-2 min-w-0 flex-1">
        <Link
          href={brand.href}
          className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground-secondary hover:text-foreground po-press shrink-0 [&_svg]:w-5 [&_svg]:h-5"
        >
          {brand.icon}
          {brand.label}
        </Link>
        <span aria-hidden="true" className="text-foreground-muted/70">/</span>
        <input
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder={p.titlePlaceholder}
          aria-label={p.eyebrow}
          className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold tracking-tight text-foreground focus:outline-none focus:ring-2 focus:ring-ring rounded-sm"
        />
      </nav>
      {/* min-w-0 + flex-wrap: на узких экранах кнопки переносятся на следующую
          строку (раньше блок был shrink-0 шире вьюпорта → обрезался справа). */}
      <div className="flex flex-wrap items-center gap-2 min-w-0 sm:shrink-0">
        <SaveIndicator state={saveState} />
        <ScheduleToggle enabled={scheduleEnabled} onToggle={onToggleSchedule} />
        {share && programId && <ShareControl programId={programId} share={share} />}
        {/* TODO(temp): экспериментальная кнопка превью программы — убрать/переосмыслить перед релизом. */}
        <Link
          href={previewHref(programId)}
          target="_blank"
          rel="noopener"
          className="h-9 px-3 inline-flex items-center gap-1.5 justify-center rounded-md border border-border bg-surface text-foreground-secondary text-xs font-medium hover:bg-slate-50 hover:text-foreground po-press [&_svg]:w-4 [&_svg]:h-4"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
          </svg>
          {p.preview}
        </Link>
        <button
          type="button"
          onClick={onClear}
          className="h-9 px-3 inline-flex items-center justify-center rounded-md border border-border bg-surface text-foreground-secondary text-xs font-medium hover:bg-slate-50 po-press"
        >
          {p.clear}
        </button>
        <button
          type="button"
          onClick={onAdd}
          className="h-9 px-4 inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-semibold shadow-sm hover:bg-primary-hover po-press"
        >
          {p.addSession}
        </button>
      </div>
    </header>
  )
}

/* ─── Schedule grid (opt-in table above the description) ─────────────── */
// Header switch that shows/hides the schedule table.
function ScheduleToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  const s = useStrings().workoutBuilder.schedule
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={enabled ? s.hide : s.show}
      onClick={onToggle}
      className={`h-9 px-3 inline-flex items-center gap-2 rounded-md border text-xs font-medium po-press [&_svg]:w-4 [&_svg]:h-4 ${
        enabled
          ? 'border-primary/40 bg-primary-soft text-primary'
          : 'border-border bg-surface text-foreground-secondary hover:bg-slate-50 hover:text-foreground'
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4M9 13h0M13 13h0M17 13h0M9 17h0M13 17h0" />
      </svg>
      <span className="hidden sm:inline">{s.toggle}</span>
      <span className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${enabled ? 'bg-primary' : 'bg-border-strong'}`} aria-hidden="true">
        <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
      </span>
    </button>
  )
}

function ScheduleTable({
  days,
  sessions,
  cells,
  rows,
  onSetCell,
  onSetDays,
  onAddRow,
  onRemoveRow,
  onRenameRow,
}: {
  days: number
  sessions: { id: string; label: string }[]
  cells: Record<string, ScheduleCell[]>
  rows: ScheduleRow[]
  onSetCell: (rowKey: string, dayIndex: number, color: SlotColor | null) => void
  onSetDays: (days: number) => void
  onAddRow: () => void
  onRemoveRow: (rowId: string) => void
  onRenameRow: (rowId: string, label: string) => void
}) {
  const s = useStrings().workoutBuilder.schedule
  const [painting, setPainting] = useState(false)
  // Drag value decided by the first cell: empty → fill, filled → erase. So a
  // single drag paints OR clears a run consistently (no palette, just toggle).
  const paintValRef = useRef<SlotColor | null>(null)

  useEffect(() => {
    if (!painting) return
    const up = () => setPainting(false)
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [painting])

  function startPaint(rowKey: string, dayIdx: number, current: SlotColor | null, fill: SlotColor) {
    const next = current ? null : fill
    paintValRef.current = next
    setPainting(true)
    onSetCell(rowKey, dayIdx, next)
  }
  function enterPaint(rowKey: string, dayIdx: number) {
    if (!painting) return
    onSetCell(rowKey, dayIdx, paintValRef.current)
  }

  const dayList = Array.from({ length: days }, (_, i) => i)

  return (
    <section className="max-w-7xl mx-auto bg-surface border border-border-subtle rounded-2xl shadow-sm overflow-hidden">
      <header className="flex flex-wrap items-start gap-x-4 gap-y-2.5 px-4 py-3 border-b border-border-subtle">
        <div className="min-w-0 mr-auto">
          <h3 className="text-sm font-bold tracking-tight text-foreground">{s.title}</h3>
          <p className="text-xs text-foreground-muted">{s.caption}</p>
        </div>
        {/* Add a custom activity row below the sets (its own colour) */}
        <button
          type="button"
          onClick={onAddRow}
          className="h-7 px-2.5 inline-flex items-center rounded-md border border-border bg-surface text-foreground-secondary text-xs font-semibold hover:bg-background-subtle hover:text-foreground po-press shrink-0"
        >
          {s.addRow}
        </button>
        {/* Day count stepper */}
        <div className="inline-flex items-center rounded-md border border-border overflow-hidden shrink-0">
          <button
            type="button"
            aria-label={s.removeDay}
            disabled={days <= SCHEDULE_MIN_DAYS}
            onClick={() => onSetDays(days - 1)}
            className="w-7 h-7 inline-flex items-center justify-center text-foreground-secondary hover:bg-background-subtle hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed po-press text-base leading-none"
          >
            −
          </button>
          <span className="px-2 h-7 inline-flex items-center justify-center text-xs font-mono tabular-nums text-foreground-secondary border-x border-border min-w-[3rem]">
            {days} {s.dayPrefix}
          </span>
          <button
            type="button"
            aria-label={s.addDay}
            disabled={days >= SCHEDULE_MAX_DAYS}
            onClick={() => onSetDays(days + 1)}
            className="w-7 h-7 inline-flex items-center justify-center text-foreground-secondary hover:bg-background-subtle hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed po-press text-base leading-none"
          >
            +
          </button>
        </div>
      </header>

      <div className="overflow-x-auto p-3">
        {sessions.length === 0 ? (
          <p className="text-center text-xs text-foreground-muted py-6">{s.emptyRows}</p>
        ) : (
          <table className="border-separate border-spacing-0.5">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-surface" aria-hidden="true" />
                {dayList.map((d) => (
                  <th
                    key={d}
                    className="px-0.5 pb-1 text-[11px] font-mono font-semibold text-foreground-muted text-center"
                  >
                    {s.dayPrefix}{d + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map((sess) => {
                const row = cells[sess.id] ?? []
                return (
                  <tr key={sess.id}>
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-surface pr-2 text-right align-middle text-[11px] font-mono font-semibold text-foreground-secondary"
                    >
                      <span className="block max-w-[8rem] truncate" title={sess.label}>{sess.label}</span>
                    </th>
                    {dayList.map((d) => {
                      const color = row[d] ?? null
                      const chip = color ? COLOR_BY_KEY[color]?.chipBg : ''
                      return (
                        <td key={d} className="p-0">
                          <button
                            type="button"
                            aria-label={`${sess.label} · ${s.dayPrefix}${d + 1}`}
                            aria-pressed={Boolean(color)}
                            onPointerDown={(e) => { e.preventDefault(); startPaint(sess.id, d, color, SCHEDULE_FILL) }}
                            onPointerEnter={() => enterPaint(sess.id, d)}
                            className={`block w-8 h-8 rounded-[3px] border transition-colors touch-none ${chip ? `${chip} border-transparent` : 'bg-surface border-border-subtle hover:bg-background-subtle hover:border-border'}`}
                          />
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              {rows.map((r) => {
                const rowCells = cells[r.id] ?? []
                const labelText = COLOR_BY_KEY[r.color]?.chipText ?? 'text-foreground-secondary'
                // Mono font → `size` (in chars) gives a clean autogrow with a min.
                const inputSize = Math.max(5, (r.label.length || s.rowPlaceholder.length) + 1)
                return (
                  <tr key={r.id}>
                    <th scope="row" className="sticky left-0 z-10 bg-surface pr-2 align-middle text-right">
                      <input
                        value={r.label}
                        size={inputSize}
                        onChange={(e) => onRenameRow(r.id, e.target.value)}
                        placeholder={s.rowPlaceholder}
                        aria-label={s.rowPlaceholder}
                        maxLength={24}
                        onPointerDown={(e) => e.stopPropagation()}
                        className={`min-w-0 bg-transparent text-right text-[11px] font-mono font-semibold ${labelText} placeholder:text-foreground-muted focus:outline-none focus:ring-1 focus:ring-ring rounded-sm px-1`}
                      />
                    </th>
                    {dayList.map((d) => {
                      const color = rowCells[d] ?? null
                      const chip = color ? COLOR_BY_KEY[color]?.chipBg : ''
                      return (
                        <td key={d} className="p-0">
                          <button
                            type="button"
                            aria-label={`${r.label || s.rowPlaceholder} · ${s.dayPrefix}${d + 1}`}
                            aria-pressed={Boolean(color)}
                            onPointerDown={(e) => { e.preventDefault(); startPaint(r.id, d, color, r.color) }}
                            onPointerEnter={() => enterPaint(r.id, d)}
                            className={`block w-8 h-8 rounded-[3px] border transition-colors touch-none ${chip ? `${chip} border-transparent` : 'bg-surface border-border-subtle hover:bg-background-subtle hover:border-border'}`}
                          />
                        </td>
                      )
                    })}
                    {/* Remove-row control on the RIGHT edge of the table */}
                    <td className="p-0 pl-1 align-middle">
                      <button
                        type="button"
                        aria-label={s.removeRow}
                        title={s.removeRow}
                        onClick={() => onRemoveRow(r.id)}
                        className="inline-flex w-5 h-5 items-center justify-center rounded text-foreground-muted hover:text-rose-600 hover:bg-rose-50 po-press shrink-0"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

/* ─── Share control — public, login-free link to the workout preview ── */
function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  )
}

function ShareControl({ programId, share }: { programId: string; share: ShareConfig }) {
  const t = useStrings()
  const s = t.workoutBuilder.program.share
  const [token, setToken] = useState<string | null>(share.initialToken)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const shareUrl = token ? `${typeof window !== 'undefined' ? window.location.origin : ''}/w/${token}` : ''

  useEffect(() => {
    if (!open) return
    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const tm = setTimeout(() => document.addEventListener('pointerdown', onPointer), 0)
    return () => { clearTimeout(tm); document.removeEventListener('pointerdown', onPointer) }
  }, [open])

  async function onToggle() {
    if (token) { setOpen((o) => !o); return }
    setBusy(true)
    const res = await share.enable(programId)
    setBusy(false)
    if (res.status === 'ok') { setToken(res.shareToken ?? null); setOpen(true) }
  }
  async function onStop() {
    setBusy(true)
    await share.disable(programId)
    setBusy(false)
    setToken(null)
    setOpen(false)
  }
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard blocked — the input is selectable as a fallback
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-md border text-xs font-medium po-press [&_svg]:w-4 [&_svg]:h-4 disabled:opacity-50 ${token ? 'border-primary/40 bg-primary-soft text-primary' : 'border-border bg-surface text-foreground-secondary hover:bg-slate-50 hover:text-foreground'}`}
      >
        <ShareIcon />
        {s.button}
      </button>
      {open && token && (
        <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 z-40 w-72 max-w-[calc(100vw-2.5rem)] rounded-xl border border-border bg-surface shadow-xl p-3 space-y-2">
          <p className="text-xs text-foreground-muted">{s.hint}</p>
          <div className="flex items-center gap-1.5">
            <input
              readOnly
              value={shareUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 h-8 px-2 rounded-md border border-border bg-background-subtle text-xs text-foreground-secondary focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={onCopy}
              className="h-8 px-2.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary-hover po-press whitespace-nowrap"
            >
              {copied ? s.copied : s.copy}
            </button>
          </div>
          <button
            type="button"
            onClick={onStop}
            disabled={busy}
            className="text-xs font-medium text-rose-600 hover:text-rose-700 po-press disabled:opacity-50"
          >
            {s.stop}
          </button>
        </div>
      )}
    </div>
  )
}

/* ─── Session card ───────────────────────────────────────────────── */
function SessionCard({
  index,
  title,
  description,
  slots,
  slotIds,
  onRename,
  onSetDescription,
  onRemove,
  canRemove,
  sessionId,
  onClearSlot,
  onSetSlotsCount,
  onSetSegments,
  onSetSide,
  paintMode,
  isPainting,
  onPaintStart,
  onPaintEnter,
}: {
  index: number
  title: string
  description?: string
  slots: Slot[]
  slotIds: string[]
  onRename: (t: string) => void
  onSetDescription: (text: string) => void
  onRemove: () => void
  canRemove: boolean
  sessionId: string
  onClearSlot: (idx: number) => void
  onSetSlotsCount: (n: number) => void
  onSetSegments: (idx: number, segments: Segment[]) => void
  onSetSide: (idx: number, side: SlotSide | null) => void
  paintMode: boolean
  isPainting: boolean
  onPaintStart: (slotIndex: number) => void
  onPaintEnter: (slotIndex: number) => void
}) {
  const t = useStrings()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sessionId,
    data: { type: 'session', sessionId } satisfies SessionDragData,
  })
  const dragStyle = {
    transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
    transition,
  }
  const filled = slots.filter((s) => s !== null).length
  const lastSlotFilled = slots[slots.length - 1] !== null
  function shrink() {
    if (slots.length <= MIN_SLOTS) return
    if (lastSlotFilled) {
      const ok = window.confirm(t.workoutBuilder.session.confirmShrink)
      if (!ok) return
    }
    onSetSlotsCount(slots.length - 1)
  }
  function grow() {
    if (slots.length >= MAX_SLOTS) return
    onSetSlotsCount(slots.length + 1)
  }
  return (
    <section
      ref={setNodeRef}
      style={dragStyle}
      className={`max-w-7xl mx-auto bg-surface border border-border-subtle rounded-2xl shadow-sm ${isDragging ? 'relative z-10 shadow-lg opacity-90' : ''}`}
    >
      <header className="group/h px-4 py-3 border-b border-border-subtle flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={t.workoutBuilder.session.dragHandle}
            title={t.workoutBuilder.session.dragHandle}
            className="inline-flex w-6 h-6 -ml-1 items-center justify-center rounded-md text-foreground-muted/60 hover:text-foreground hover:bg-background-subtle shrink-0 cursor-grab active:cursor-grabbing touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
          >
            <GripIcon />
          </button>
          <span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-papaya-100 text-papaya-700 text-[11px] font-bold font-mono shrink-0">
            {index}
          </span>
          <input
            value={title}
            onChange={(e) => onRename(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-ring rounded-sm"
          />
          <SlotsCounter filled={filled} total={slots.length} onDec={shrink} onInc={grow} />
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={t.workoutBuilder.session.removeTitle}
            className="inline-flex w-8 h-8 items-center justify-center rounded-md text-foreground-muted hover:text-rose-600 hover:bg-rose-50 po-press"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </header>
      <AutoGrowNote
        value={description ?? ''}
        onChange={onSetDescription}
        placeholder={t.workoutBuilder.session.descriptionPlaceholder}
      />
      <div className="px-3 pb-3 pt-1 grid grid-cols-3 sm:grid-cols-6 gap-2">
        <SortableContext items={slotIds} strategy={rectSortingStrategy}>
          {slots.map((slot, idx) => (
            <DropSlot
              key={slotIds[idx]}
              slotId={slotIds[idx]}
              sessionId={sessionId}
              slotIndex={idx}
              slot={slot}
              onClear={() => onClearSlot(idx)}
              onSetSegments={(segs) => onSetSegments(idx, segs)}
              onSetSide={(side) => onSetSide(idx, side)}
              paintMode={paintMode}
              isPainting={isPainting}
              onPaintStart={() => onPaintStart(idx)}
              onPaintEnter={() => onPaintEnter(idx)}
            />
          ))}
        </SortableContext>
      </div>
    </section>
  )
}

/* ─── Auto-grow note — borderless textarea that grows with its content ── */
// Shared by the per-set note (under each session header) and the program-wide
// plan (above the sets). rows={1} keeps the collapsed state to a single line;
// height is reset to scrollHeight on every value change (incl. mount).
function AutoGrowNote({
  value,
  onChange,
  placeholder,
  wrapperClassName = 'px-4 pt-2.5',
  textClassName = 'text-[13px] leading-relaxed text-foreground-secondary',
}: {
  value: string
  onChange: (text: string) => void
  placeholder: string
  wrapperClassName?: string
  textClassName?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <div className={wrapperClassName}>
      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full resize-none overflow-hidden bg-transparent placeholder:text-foreground-muted focus:outline-none ${textClassName}`}
      />
    </div>
  )
}

function SlotsCounter({
  filled,
  total,
  onDec,
  onInc,
}: {
  filled: number
  total: number
  onDec: () => void
  onInc: () => void
}) {
  const t = useStrings()
  return (
    <div className="inline-flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={onDec}
        disabled={total <= MIN_SLOTS}
        aria-label={t.workoutBuilder.slotsCounter.remove}
        className="inline-flex w-6 h-6 items-center justify-center rounded-md text-foreground-muted hover:bg-background-subtle disabled:opacity-30 disabled:cursor-not-allowed po-press"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>
      <span className="font-mono text-[10px] text-foreground-muted tabular-nums min-w-[32px] text-center">
        {filled}/{total}
      </span>
      <button
        type="button"
        onClick={onInc}
        disabled={total >= MAX_SLOTS}
        aria-label={t.workoutBuilder.slotsCounter.add}
        className="inline-flex w-6 h-6 items-center justify-center rounded-md text-foreground-muted hover:bg-background-subtle disabled:opacity-30 disabled:cursor-not-allowed po-press"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>
    </div>
  )
}

/* ─── Slot (droppable + sometimes draggable) ─────────────────────── */
function DropSlot({
  slotId,
  sessionId,
  slotIndex,
  slot,
  onClear,
  onSetSegments,
  onSetSide,
  paintMode,
  isPainting,
  onPaintStart,
  onPaintEnter,
}: {
  slotId: string
  sessionId: string
  slotIndex: number
  slot: Slot
  onClear: () => void
  onSetSegments: (segments: Segment[]) => void
  onSetSide: (side: SlotSide | null) => void
  paintMode: boolean
  isPainting: boolean
  onPaintStart: () => void
  onPaintEnter: () => void
}) {
  const hasAsana = !!slot?.asana
  // One sortable node per slot. Filled slots are draggable (grab the asana to
  // reorder); empty slots are drop-only targets. `droppable` stays on for both
  // so the sortable can push them aside / accept a fresh asana from the library.
  const { setNodeRef, attributes, listeners, transform, transition, isOver, isDragging } = useSortable({
    id: slotId,
    data: { sessionId, slotIndex, source: 'slot', asanaId: slot?.asana?.id },
    disabled: { draggable: paintMode || !hasAsana, droppable: false },
  })
  // The "will replace" ghost is only meaningful for a fresh asana from the
  // library — not when reordering existing slots within the set.
  const { active } = useDndContext()
  const isLibraryDrag = (active?.data.current as DragData | undefined)?.source === 'library'
  const sortStyle = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
  }
  return (
    <div
      ref={setNodeRef}
      style={sortStyle}
      className={[
        // `transition-colors` (NOT `transition`): only animate border/bg for the
        // hover highlight. A blanket `transition` also animates `transform`, which
        // fights dnd-kit's own transform handling and broke the reorder settle.
        hasAsana
          ? `relative flex flex-col rounded-xl border-2 bg-background-subtle transition-colors ${
              isOver && isLibraryDrag ? 'border-primary ring-2 ring-primary/30' : 'border-transparent'
            }`
          : `relative flex flex-col rounded-xl border-2 border-dashed transition-colors ${
              isOver ? 'border-primary bg-primary-soft' : 'border-border bg-background-subtle/50'
            }`,
        isDragging ? 'z-10' : '',
      ].join(' ')}
    >
      {/* Hover-over a filled slot while dragging → "will replace" ghost: dim the
          asana under a primary veil + a swap icon. pointer-events-none so it never
          blocks the drop. Hidden while *this* slot is the one being dragged. */}
      {hasAsana && isOver && !isDragging && isLibraryDrag && (
        <div className="absolute inset-0 z-20 rounded-xl bg-primary-soft/80 ring-2 ring-primary flex items-center justify-center pointer-events-none">
          <svg className="w-6 h-6 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M16 3h5v5" /><path d="M21 3l-7 7" /><path d="M8 21H3v-5" /><path d="M3 21l7-7" />
          </svg>
        </div>
      )}
      {hasAsana ? (
        <FilledSlot
          slot={slot!}
          sessionId={sessionId}
          slotIndex={slotIndex}
          dragAttributes={attributes}
          dragListeners={listeners}
          isDragging={isDragging}
          onClear={onClear}
          onSetSegments={onSetSegments}
          onSetSide={onSetSide}
          paintMode={paintMode}
          isPainting={isPainting}
          onPaintStart={onPaintStart}
          onPaintEnter={onPaintEnter}
        />
      ) : (
        <EmptyWithBreath
          segments={slot?.segments ?? []}
          onSetSegments={onSetSegments}
        />
      )}
    </div>
  )
}

/* ─── Empty slot — still allows assigning breath count before asana ──── */
function EmptyWithBreath({
  segments,
  onSetSegments,
}: {
  segments: Segment[]
  onSetSegments: (segs: Segment[]) => void
}) {
  const t = useStrings()
  const [popoverOpen, setPopoverOpen] = useState(false)
  return (
    <div className="relative flex flex-col w-full">
      <div className="aspect-square" />
      <SegmentsRow
        segments={segments}
        onClick={() => setPopoverOpen(true)}
        paintMode={false}
        isPainting={false}
        onPaintStart={() => {}}
        onPaintEnter={() => {}}
      />
      {popoverOpen && (
        <SegmentsPopover
          asanaLabel={t.workoutBuilder.slot.emptyLabel}
          initial={segments}
          onSave={(s) => {
            onSetSegments(s)
            setPopoverOpen(false)
          }}
          onClose={() => setPopoverOpen(false)}
        />
      )}
    </div>
  )
}

function FilledSlot({
  slot,
  dragAttributes,
  dragListeners,
  isDragging,
  onClear,
  onSetSegments,
  onSetSide,
  paintMode,
  isPainting,
  onPaintStart,
  onPaintEnter,
}: {
  slot: NonNullable<Slot>
  sessionId: string
  slotIndex: number
  dragAttributes: DraggableAttributes
  dragListeners: SyntheticListenerMap | undefined
  isDragging: boolean
  onClear: () => void
  onSetSegments: (segments: Segment[]) => void
  onSetSide: (side: SlotSide | null) => void
  paintMode: boolean
  isPainting: boolean
  onPaintStart: () => void
  onPaintEnter: () => void
}) {
  const t = useStrings()
  const asana = slot.asana!
  const [popoverOpen, setPopoverOpen] = useState(false)
  const segments = slot.segments ?? []
  // In paint mode → paint handlers; otherwise → the sortable's drag listeners.
  // NB: these must be ONE object spread (not an explicit onPointerDown after the
  // spread, which would override the drag activator with undefined).
  const dragHandle = paintMode
    ? {
        onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); onPaintStart() },
        onPointerEnter: isPainting ? () => onPaintEnter() : undefined,
      }
    : { ...dragAttributes, ...dragListeners }

  return (
    <div
      className={`group relative w-full h-full flex flex-col rounded-xl ${isDragging ? 'opacity-30' : ''}`}
    >
      <div
        {...dragHandle}
        className={`relative flex-1 aspect-square ${paintMode ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'} touch-none`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asana.src} alt={asana.label} draggable={false} className="absolute inset-0 w-full h-full object-contain p-2 select-none pointer-events-none" />
        {!paintMode && <SideRadio side={slot.side} onChange={onSetSide} />}
        {!paintMode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onClear()
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={t.workoutBuilder.slot.clear}
            className="absolute top-1 right-1 inline-flex w-5 h-5 items-center justify-center rounded-full bg-surface/90 text-foreground-muted opacity-0 group-hover:opacity-100 hover:text-rose-600 transition-opacity shadow-sm"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      <SegmentsRow
        segments={segments}
        color={slot.color}
        onClick={() => setPopoverOpen(true)}
        paintMode={paintMode}
        isPainting={isPainting}
        onPaintStart={onPaintStart}
        onPaintEnter={onPaintEnter}
      />
      {popoverOpen && (
        <SegmentsPopover
          asanaLabel={asana.label}
          initial={segments}
          onSave={(s) => {
            onSetSegments(s)
            setPopoverOpen(false)
          }}
          onClose={() => setPopoverOpen(false)}
        />
      )}
    </div>
  )
}

function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
    </svg>
  )
}

/* ─── Side selector — L / custom-letter input / R (top-left, on hover) ─── */
function SideRadio({ side, onChange }: { side?: SlotSide; onChange: (s: SlotSide | null) => void }) {
  const s = useStrings().workoutBuilder.slot
  const current = side ?? null
  // Middle is a free text field (#4): L/R — быстрые кнопки, посередине можно
  // вписать свою букву/метку. side хранится как строка (L/R или кастом).
  const customVal = current && current !== 'L' && current !== 'R' ? current : ''
  const sideBtn = (active: boolean) =>
    active
      ? 'inline-flex w-5 h-5 items-center justify-center text-[10px] font-bold bg-primary text-primary-foreground'
      : 'inline-flex w-5 h-5 items-center justify-center text-[10px] font-semibold text-foreground-muted hover:bg-background-subtle hover:text-foreground transition-colors'
  return (
    <div
      role="group"
      aria-label={s.sideGroupLabel}
      onPointerDown={(e) => e.stopPropagation()}
      className={`absolute top-1 left-1 z-10 inline-flex items-center rounded-md bg-surface/95 ring-1 ring-border shadow-sm overflow-hidden transition-opacity focus-within:opacity-100 ${current ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
    >
      <button
        type="button"
        aria-label={s.sideLeft}
        aria-pressed={current === 'L'}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onChange(current === 'L' ? null : 'L') }}
        className={sideBtn(current === 'L')}
      >
        L
      </button>
      <input
        value={customVal}
        maxLength={3}
        placeholder="—"
        aria-label={s.sideBoth}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => { const v = e.target.value.trim(); onChange(v ? v : null) }}
        className="w-7 h-5 text-center text-[10px] font-bold bg-transparent text-foreground placeholder:text-foreground-muted border-x border-border focus:outline-none focus:bg-background-subtle"
      />
      <button
        type="button"
        aria-label={s.sideRight}
        aria-pressed={current === 'R'}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onChange(current === 'R' ? null : 'R') }}
        className={sideBtn(current === 'R')}
      >
        R
      </button>
    </div>
  )
}

/* ─── Segments row (chip at the bottom of a filled slot) ──────────── */
function SegmentsRow({
  segments,
  color,
  onClick,
  paintMode,
  isPainting,
  onPaintStart,
  onPaintEnter,
}: {
  segments: Segment[]
  color?: SlotColor
  onClick: () => void
  paintMode: boolean
  isPainting: boolean
  onPaintStart: () => void
  onPaintEnter: () => void
}) {
  const t = useStrings()
  const palette = color ? COLOR_BY_KEY[color] : null
  const colorCls = palette ? `${palette.chipBg} ${palette.chipText} border-transparent` : 'text-foreground-secondary border-border-subtle hover:bg-background-subtle'
  return (
    <button
      type="button"
      onClick={paintMode ? undefined : onClick}
      onPointerDown={paintMode ? (e) => { e.preventDefault(); onPaintStart() } : (e) => e.stopPropagation()}
      onPointerEnter={paintMode && isPainting ? () => onPaintEnter() : undefined}
      className={`w-full h-6 px-1.5 border-t flex items-center justify-center gap-1.5 text-[10px] font-mono po-press rounded-b-xl ${colorCls} ${paintMode ? 'cursor-crosshair' : ''}`}
      title={paintMode ? t.workoutBuilder.segments.paintTitle : t.workoutBuilder.segments.setBreathTitle}
    >
      {segments.length === 0 ? (
        <span className={palette ? '' : 'text-foreground-muted/70'}>{t.workoutBuilder.segments.addBreath}</span>
      ) : (
        segments.map((seg, i) => <SegmentChip key={i} seg={seg} />)
      )}
    </button>
  )
}

function SegmentChip({ seg }: { seg: Segment }) {
  return (
    <span className="inline-flex items-center gap-0.5 tabular-nums">
      <SegmentShape type={seg.type} />
      <span>{seg.count}</span>
    </span>
  )
}

function SegmentShape({ type, size = 8 }: { type: SegmentType; size?: number }) {
  if (type === 'S') {
    return (
      <span
        aria-hidden="true"
        className="inline-block bg-foreground-secondary"
        style={{ width: size, height: size }}
      />
    )
  }
  // Triangle for dynamic.
  return (
    <svg width={size + 2} height={size + 2} viewBox="0 0 12 12" aria-hidden="true">
      <polygon points="6,1 11,11 1,11" fill="currentColor" />
    </svg>
  )
}

/* ─── Popover editor ─────────────────────────────────────────────── */
function SegmentsPopover({
  asanaLabel,
  initial,
  onSave,
  onClose,
}: {
  asanaLabel: string
  initial: Segment[]
  onSave: (segs: Segment[]) => void
  onClose: () => void
}) {
  const t = useStrings()
  const [drafts, setDrafts] = useState<Segment[]>(() => (initial.length > 0 ? initial : [{ type: 'S', count: 3 }]))
  const ref = useRef<HTMLDivElement>(null)

  // Tell the builder a popover is open so it hides the floating paint dock
  // (which is fixed at the viewport bottom and would otherwise cover this).
  const dockGuard = useContext(PaintDockGuardContext)
  useEffect(() => {
    dockGuard.open()
    return () => dockGuard.close()
  }, [dockGuard])

  // Dismiss (outside click / Escape) closes WITHOUT applying — breaths are
  // committed only via the explicit "Done" button (or Enter). Enter = confirm.
  useEffect(() => {
    function onPointer(e: PointerEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter') onSave(drafts.filter((s) => s.count > 0))
    }
    // Defer so the opening click does not immediately trigger close.
    const timer = setTimeout(() => document.addEventListener('pointerdown', onPointer), 0)
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [drafts, onSave, onClose])

  function update(i: number, patch: Partial<Segment>) {
    setDrafts((d) => d.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  }
  function add() {
    if (drafts.length >= MAX_SEGMENTS) return
    setDrafts((d) => [...d, { type: 'S', count: 3 }])
  }
  function remove(i: number) {
    setDrafts((d) => d.filter((_, j) => j !== i))
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${t.workoutBuilder.segments.popoverAriaPrefix} · ${asanaLabel}`}
      // Mobile: fixed по центру экрана (anchored-попап у слота обрезался краем
      // вьюпорта и library-sheet'ом). С sm+ — прежний попап под слотом.
      className="fixed left-4 right-4 top-1/2 -translate-y-1/2 z-[60] sm:absolute sm:z-30 sm:left-1/2 sm:right-auto sm:top-full sm:translate-y-0 sm:-translate-x-1/2 sm:mt-2 sm:w-64 bg-surface border border-border rounded-xl shadow-xl p-3 space-y-2"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Add button pinned to the top so it stays under the cursor — appending a
          segment grows the list downward and never shoves the button away. */}
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-wider text-foreground-muted">
          {t.workoutBuilder.segments.popoverEyebrowPrefix} {MAX_SEGMENTS}
        </p>
        <button
          type="button"
          onClick={add}
          disabled={drafts.length >= MAX_SEGMENTS}
          className="h-7 px-2.5 inline-flex items-center justify-center rounded-md border border-border bg-surface text-xs font-medium text-foreground-secondary hover:bg-background-subtle disabled:opacity-30 disabled:cursor-not-allowed po-press whitespace-nowrap"
        >
          {t.workoutBuilder.segments.addSegment}
        </button>
      </div>
      <ul className="space-y-1.5">
        {drafts.map((seg, i) => (
          <li key={i} className="flex items-center gap-2">
            <TypeToggle
              value={seg.type}
              onChange={(next) => update(i, { type: next })}
            />
            {/* −/+ stepper: один клик = ±1 (нативный number-спиннер «залипал»
                и быстро листал — #3). text+inputMode убирает спиннер совсем. */}
            <div className="inline-flex items-center rounded-md border border-border bg-background-subtle overflow-hidden">
              <button
                type="button"
                aria-label="−1"
                onClick={() => update(i, { count: Math.max(1, seg.count - 1) })}
                className="w-7 h-8 inline-flex items-center justify-center text-foreground-secondary hover:bg-surface hover:text-foreground po-press text-base leading-none"
              >
                −
              </button>
              <input
                type="text"
                inputMode="numeric"
                value={seg.count}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))
                  update(i, { count: Math.max(1, Math.min(999, n || 1)) })
                }}
                onFocus={(e) => e.currentTarget.select()}
                className="w-12 h-8 px-1 text-center border-x border-border bg-surface text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset"
                aria-label={t.workoutBuilder.segments.countLabel}
              />
              <button
                type="button"
                aria-label="+1"
                onClick={() => update(i, { count: Math.min(999, seg.count + 1) })}
                className="w-7 h-8 inline-flex items-center justify-center text-foreground-secondary hover:bg-surface hover:text-foreground po-press text-base leading-none"
              >
                +
              </button>
            </div>
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={t.workoutBuilder.segments.removeSegment}
              className="inline-flex w-7 h-7 items-center justify-center rounded-md text-foreground-muted hover:text-rose-600 hover:bg-rose-50 po-press ml-auto"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-end gap-2 pt-1">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSave([])}
            className="h-7 px-2.5 inline-flex items-center justify-center rounded-md text-xs font-medium text-foreground-muted hover:text-rose-600 hover:bg-rose-50 po-press whitespace-nowrap"
          >
            {t.workoutBuilder.segments.clear}
          </button>
          <button
            type="button"
            onClick={() => onSave(drafts.filter((s) => s.count > 0))}
            className="h-7 px-3 inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-semibold shadow-sm hover:bg-primary-hover po-press whitespace-nowrap"
          >
            {t.workoutBuilder.segments.done}
          </button>
        </div>
      </div>
    </div>
  )
}

function TypeToggle({ value, onChange }: { value: SegmentType; onChange: (next: SegmentType) => void }) {
  const t = useStrings()
  return (
    <div className="inline-flex rounded-md border border-border overflow-hidden shrink-0">
      {(['S', 'D'] as const).map((kind) => (
        <button
          key={kind}
          type="button"
          onClick={() => onChange(kind)}
          aria-pressed={value === kind}
          title={kind === 'S' ? t.workoutBuilder.segments.typeStatic : t.workoutBuilder.segments.typeDynamic}
          className={
            value === kind
              ? 'h-8 w-9 inline-flex items-center justify-center gap-1 bg-foreground text-background text-xs font-bold'
              : 'h-8 w-9 inline-flex items-center justify-center gap-1 bg-surface text-foreground-muted hover:bg-background-subtle text-xs font-medium po-press'
          }
        >
          <SegmentShape type={kind} size={9} />
          <span>{kind}</span>
        </button>
      ))}
    </div>
  )
}

/* ─── Library ────────────────────────────────────────────────────── */
// Контент библиотеки (заголовок + табы + поиск + грид) — общий для desktop-aside
// и мобильного bottom-sheet. Родитель — flex-col; грид-зона тянется (flex-1).
function LibraryPanel({
  tab,
  onTab,
  query,
  onQuery,
  hydrated,
  filtered,
  onPick,
}: {
  tab: 'all' | AsanaLevel
  onTab: (t: 'all' | AsanaLevel) => void
  query: string
  onQuery: (q: string) => void
  hydrated: boolean
  filtered: Asana[]
  onPick: (a: Asana) => void
}) {
  const t = useStrings()
  return (
    <>
      {/* Заголовок — только desktop: на мобиле каждый пиксель sheet-хрома
          отнимает место у грида асан (грабер уже намекает, что это библиотека). */}
      <header className="hidden lg:block shrink-0 px-4 pb-3 pt-4 border-b border-border-subtle">
        <p className="font-mono text-[10px] uppercase tracking-wider text-foreground-muted">{t.workoutBuilder.library.eyebrow}</p>
        <h2 className="mt-0.5 text-sm font-bold tracking-tight text-foreground">{t.workoutBuilder.library.title} · {filtered.length}</h2>
      </header>
      <div className="shrink-0">
        <LibraryTabs tab={tab} onChange={onTab} />
      </div>
      <div className="shrink-0 p-2 lg:p-3 border-b border-border-subtle">
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t.workoutBuilder.library.searchPlaceholder}
          className="w-full h-8 lg:h-9 px-3 rounded-md border border-border bg-background-subtle text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-border-strong"
        />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {hydrated ? (
          <>
            {/* Mobile sheet шире desktop-aside → 4 колонки влезают комфортно. */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2">
              {filtered.map((a) => (
                <LibraryItem key={a.id} asana={a} onClick={() => onPick(a)} />
              ))}
            </div>
            {filtered.length === 0 && (
              <p className="text-center text-xs text-foreground-muted py-8">{t.workoutBuilder.library.notFound}</p>
            )}
          </>
        ) : (
          <p className="text-center text-xs text-foreground-muted py-8">…</p>
        )}
      </div>
    </>
  )
}

function LibraryTabs({
  tab,
  onChange,
}: {
  tab: 'all' | AsanaLevel
  onChange: (next: 'all' | AsanaLevel) => void
}) {
  const t = useStrings()
  const items: { value: 'all' | AsanaLevel; label: string }[] = [
    { value: 'all', label: t.workoutBuilder.library.all },
    // L1–L6 are codes shown verbatim; "Other" is a real word → localise it.
    ...LEVELS.map((l) => ({ value: l, label: l === 'Other' ? t.workoutBuilder.library.other : l })),
  ]
  return (
    <div className="border-b border-border-subtle px-2">
      <ul className="flex flex-wrap">
        {items.map((it) => {
          const active = it.value === tab
          return (
            <li key={it.value}>
              <button
                type="button"
                onClick={() => onChange(it.value)}
                aria-pressed={active}
                className={
                  active
                    ? 'px-3 py-2 lg:py-2.5 text-xs font-semibold text-foreground border-b-2 border-primary -mb-px'
                    : 'px-3 py-2 lg:py-2.5 text-xs font-medium text-foreground-muted hover:text-foreground border-b-2 border-transparent -mb-px po-press'
                }
              >
                {it.label}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function LibraryItem({ asana, onClick }: { asana: Asana; onClick: () => void }) {
  const t = useStrings()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `lib:${asana.id}`,
    data: { source: 'library', asanaId: asana.id } satisfies DragData,
  })
  // Click adds to first empty slot. Drag still works because the PointerSensor's
  // activation distance (5px) lets short taps fall through to onClick.
  return (
    <button
      type="button"
      ref={setNodeRef}
      onClick={onClick}
      {...attributes}
      {...listeners}
      className={`aspect-square rounded-lg border border-border bg-background-subtle hover:border-border-strong hover:shadow-sm cursor-grab active:cursor-grabbing transition p-1.5 ${isDragging ? 'opacity-30' : ''}`}
      title={`${asana.level} · ${asana.label} — ${t.workoutBuilder.library.itemHint}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={asana.src}
        alt={asana.label}
        draggable={false}
        loading="lazy"
        className="w-full h-full object-contain select-none pointer-events-none"
      />
    </button>
  )
}

function AsanaThumb({ asana, dragOverlay }: { asana: Asana; dragOverlay?: boolean }) {
  return (
    <div
      className={
        dragOverlay
          ? 'w-20 h-20 rounded-lg bg-surface border border-border-strong shadow-lg p-1.5 cursor-grabbing'
          : 'w-full h-full p-1.5'
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asana.src} alt={asana.label} draggable={false} className="w-full h-full object-contain" />
    </div>
  )
}

