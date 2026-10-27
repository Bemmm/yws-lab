"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type Active,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
  type Modifier,
  type Over,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ConfirmProvider, useConfirm } from "@/components/ConfirmDialog";
import { Toggle } from "@/components/Toggle";
import { format } from "@/i18n/format";
import { getAsana } from "./asana-manifest";
import { ArrowLeftIcon, EyeIcon, XIcon } from "./icons";
import { LibraryPanel, type LibraryTab } from "./library-panel";
import { type HideSaveResult, type Program, type SaveResult, type SaveState, type SlotColor, useProgram } from "./use-program";
import { PAINT_COLORS } from "./palette";
import { ScheduleTable } from "./schedule-table";
import { AutoGrowNote, SessionCard, type SessionDragData } from "./session-card";
import { PaintDockGuardContext } from "./segments-popover";
import { ShareControl, type ShareConfig } from "./share-control";
import type { DragData } from "./slot";
import { useAsanaAlt, useStrings } from "./strings";
import { MAX_SESSIONS, TITLE_MAX } from "./model";

export type { ShareConfig } from "./share-control";

/** Dependency injection seam (spec §12): the wiring layer supplies persistence, sharing and links. */
export type BuilderClientProps = {
  initialProgram: Program;
  /** Persist the full document. The wiring layer attaches the last known version (see PlanEditor). */
  save: (program: Program) => Promise<SaveResult>;
  /** Keepalive transport for the final flush on page hide (optional). */
  saveOnHide?: (program: Program) => Promise<HideSaveResult>;
  share?: ShareConfig;
  /** Builder -> preview link, computed from the program id. */
  previewHref: (programId: string) => string;
  /** Plain back link (library) instead of Papaya's brand breadcrumb. */
  backHref: string;
  /** Link for the "deleted elsewhere" state. Defaults to backHref. */
  goneHref?: string;
  /** Link to sign in again after the session expired. */
  signInHref?: string;
  /** Reload latest after a version conflict. Defaults to a full page reload. */
  reload?: () => void;
};

// Pin the drag overlay's centre to the pointer (the node origin is mis-measured in this layout).
const snapCenterToCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (!draggingNodeRect || !activatorEvent) return transform;
  const e = activatorEvent as PointerEvent;
  if (typeof e.clientX !== "number" || typeof e.clientY !== "number") return transform;
  return {
    ...transform,
    x: transform.x + (e.clientX - draggingNodeRect.left) - draggingNodeRect.width / 2,
    y: transform.y + (e.clientY - draggingNodeRect.top) - draggingNodeRect.height / 2,
  };
};

// Library drop: fade + shrink the ghost in place instead of flying back to the (mis-measured) source card.
const libraryDropAnimation: DropAnimation = {
  duration: 170,
  easing: "cubic-bezier(0.23, 1, 0.32, 1)",
  keyframes: ({ transform }) => {
    const t = `translate3d(${transform.initial.x}px, ${transform.initial.y}px, 0)`;
    return [
      { opacity: 1, transform: `${t} scale(1)` },
      { opacity: 0, transform: `${t} scale(0.82)` },
    ];
  },
};

type AnyDragData = DragData | SessionDragData;

// Set drags collide only with other sets; asana drags only with slots.
const builderCollision: CollisionDetection = (args) => {
  const isSession = (c: { data: { current?: unknown } }) => (c.data.current as { type?: string } | undefined)?.type === "session";
  const active = args.active.data.current as { type?: string; source?: string } | undefined;
  if (active?.type === "session") {
    return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(isSession) });
  }
  const slots = args.droppableContainers.filter((c) => !isSession(c));
  if (active?.source === "slot") return closestCenter({ ...args, droppableContainers: slots });
  // Fresh asana from the catalog: land in the slot under the POINTER (rect of the dragged card can read 0,0).
  const hits = pointerWithin({ ...args, droppableContainers: slots });
  return hits.length ? hits : rectIntersection({ ...args, droppableContainers: slots });
};

/* Below lg the catalog lives in a bottom sheet with a handle (height 92 px .. 85 vh, starts at 38 vh). */
const DESKTOP_MQ = "(min-width: 1024px)";
function subscribeDesktop(cb: () => void) {
  const mq = window.matchMedia(DESKTOP_MQ);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const getIsDesktop = () => window.matchMedia(DESKTOP_MQ).matches;
const getIsDesktopServer = () => true;
const SHEET_MIN = 92;
const SHEET_MAX_VH = 0.85;
const LIB_MIN = 280;
const LIB_MAX = 760;
const LIB_DEFAULT = 360;

export function BuilderClient(props: BuilderClientProps) {
  return (
    <ConfirmProvider>
      <BuilderInner {...props} />
    </ConfirmProvider>
  );
}

function BuilderInner({ initialProgram, save, saveOnHide, share, previewHref, backHref, goneHref, signInHref = "/login", reload }: BuilderClientProps) {
  const t = useStrings();
  const confirm = useConfirm();
  const altFor = useAsanaAlt();
  const defaultSetTitle = useMemo(() => (n: number) => format(t.defaults.setTitle, { n }), [t]);
  const {
    program,
    saveState,
    retrying,
    retry,
    discardUnsaved,
    addToFirstEmpty,
    setTitle,
    setProgramDescription,
    addSession,
    removeSession,
    renameSession,
    setSessionDescription,
    setSlot,
    moveSlot,
    moveSlotBy,
    clearProgram,
    setSlotsCount,
    setSegments,
    setSlotColor,
    setSlotSide,
    reorderSessions,
    moveSessionBy,
    setScheduleEnabled,
    setScheduleDays,
    setScheduleCell,
    addScheduleRow,
    removeScheduleRow,
    renameScheduleRow,
  } = useProgram({ initial: initialProgram, save, saveOnHide, setTitle: defaultSetTitle });

  const [paintColor, setPaintColor] = useState<SlotColor | "clear" | null>(null);
  const [isPainting, setIsPainting] = useState(false);
  const paintMode = paintColor !== null;

  // Open segments popovers hide the paint dock.
  const [openPopovers, setOpenPopovers] = useState(0);
  const dockGuard = useMemo(
    () => ({ open: () => setOpenPopovers((n) => n + 1), close: () => setOpenPopovers((n) => Math.max(0, n - 1)) }),
    [],
  );

  const isDesktop = useSyncExternalStore(subscribeDesktop, getIsDesktop, getIsDesktopServer);
  const [sheetH, setSheetH] = useState(320);
  const sheetDragRef = useRef<{ startY: number; startH: number } | null>(null);
  const [libWidth, setLibWidth] = useState(LIB_DEFAULT);
  const [libDragging, setLibDragging] = useState(false);
  const libDragRef = useRef<{ startX: number; startW: number } | null>(null);
  // Resized by mutating the grid template during the drag (no per-frame re-render of the 1,239-item catalog).
  const libGridRef = useRef<HTMLDivElement>(null);
  const pendingLibWidthRef = useRef(LIB_DEFAULT);

  function onLibHandleDown(e: React.PointerEvent) {
    e.preventDefault();
    libDragRef.current = { startX: e.clientX, startW: libWidth };
    setLibDragging(true);
    document.body.style.cursor = "col-resize";
    let raf = 0;
    function move(ev: PointerEvent) {
      const d = libDragRef.current;
      if (!d) return;
      pendingLibWidthRef.current = Math.max(LIB_MIN, Math.min(LIB_MAX, d.startW + (d.startX - ev.clientX)));
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (libGridRef.current) libGridRef.current.style.gridTemplateColumns = `minmax(0,1fr) ${pendingLibWidthRef.current}px`;
        });
      }
    }
    function up() {
      libDragRef.current = null;
      setLibDragging(false);
      document.body.style.cursor = "";
      if (raf) cancelAnimationFrame(raf);
      setLibWidth(pendingLibWidthRef.current);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  function onLibHandleKey(e: React.KeyboardEvent) {
    const step = e.key === "ArrowLeft" ? 24 : e.key === "ArrowRight" ? -24 : 0;
    if (!step) return;
    e.preventDefault();
    setLibWidth((w) => Math.max(LIB_MIN, Math.min(LIB_MAX, w + step)));
  }

  useEffect(() => {
    // One-time hydration after mount: the server does not know the viewport height.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSheetH(Math.round(window.innerHeight * 0.38));
  }, []);
  function onSheetHandleDown(e: React.PointerEvent) {
    e.preventDefault();
    sheetDragRef.current = { startY: e.clientY, startH: sheetH };
    function onMove(ev: PointerEvent) {
      const d = sheetDragRef.current;
      if (!d) return;
      const max = Math.round(window.innerHeight * SHEET_MAX_VH);
      setSheetH(Math.min(max, Math.max(SHEET_MIN, d.startH + (d.startY - ev.clientY))));
    }
    function onUp() {
      sheetDragRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }
  function onSheetHandleKey(e: React.KeyboardEvent) {
    const step = e.key === "ArrowUp" ? 40 : e.key === "ArrowDown" ? -40 : 0;
    if (!step) return;
    e.preventDefault();
    const max = Math.round(window.innerHeight * SHEET_MAX_VH);
    setSheetH((h) => Math.min(max, Math.max(SHEET_MIN, h + step)));
  }

  // A drag-paint stroke ends anywhere on the page.
  useEffect(() => {
    if (!isPainting) return;
    const up = () => setIsPainting(false);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [isPainting]);

  function applyPaint(sessionId: string, slotIndex: number) {
    if (paintColor === null) return;
    setSlotColor(sessionId, slotIndex, paintColor === "clear" ? null : paintColor);
  }

  const [tab, setTab] = useState<LibraryTab>("all");
  const [activeDrag, setActiveDrag] = useState<DragData | null>(null);
  const [lastDragSource, setLastDragSource] = useState<DragData["source"] | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (noticeTimer.current && clearTimeout(noticeTimer.current)), []);

  function pick(asana: Parameters<typeof addToFirstEmpty>[0]) {
    if (addToFirstEmpty(asana)) {
      setNotice(null);
      return;
    }
    setNotice(t.library.full);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 6000);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const dragAsana = activeDrag?.asanaId ? getAsana(activeDrag.asanaId) ?? null : null;

  function onDragStart(e: DragStartEvent) {
    const data = e.active.data.current as AnyDragData | undefined;
    if (data && "source" in data) {
      setActiveDrag(data);
      setLastDragSource(data.source);
    }
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveDrag(null);
    const active = e.active.data.current as AnyDragData | undefined;
    if (!active) return;
    if ("type" in active && active.type === "session") {
      const over = e.over?.data.current as { sessionId?: string } | undefined;
      if (over?.sessionId) reorderSessions(active.sessionId, over.sessionId);
      return;
    }
    const to = e.over?.data.current as { sessionId: string; slotIndex: number } | undefined;
    if (!("source" in active) || !to) return;
    if (active.source === "library") {
      const asana = getAsana(active.asanaId);
      if (asana) setSlot(to.sessionId, to.slotIndex, asana);
    } else {
      moveSlot(active.sessionId, active.slotIndex, to.sessionId, to.slotIndex);
    }
  }

  const nameOf = (x: Active | Over) => (x.data.current as { label?: string } | undefined)?.label ?? "";
  const announcements = {
    onDragStart: ({ active }: { active: Active }) => format(t.a11y.picked, { name: nameOf(active) }),
    onDragOver: ({ active, over }: { active: Active; over: Over | null }) =>
      over ? format(t.a11y.over, { name: nameOf(active), target: nameOf(over) }) : undefined,
    onDragEnd: ({ active, over }: { active: Active; over: Over | null }) =>
      over ? format(t.a11y.dropped, { name: nameOf(active), target: nameOf(over) }) : t.a11y.cancelled,
    onDragCancel: () => t.a11y.cancelled,
  };

  async function onClear() {
    const ok = await confirm({
      title: t.program.clearConfirm.title,
      body: t.program.clearConfirm.body,
      confirmLabel: t.program.clearConfirm.confirm,
      cancelLabel: t.session.cancel,
    });
    if (ok) clearProgram();
  }

  const hasAsana = program.sessions.some((s) => s.slots.some((sl) => sl?.asana));
  const scheduleEnabled = program.schedule?.enabled ?? false;
  const stopped = saveState === "conflict" || saveState === "gone";

  return (
    <PaintDockGuardContext.Provider value={dockGuard}>
      <DndContext
        id="plan-builder-dnd"
        sensors={sensors}
        collisionDetection={builderCollision}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        accessibility={{ screenReaderInstructions: { draggable: t.a11y.instructions }, announcements }}
      >
        <div className="min-h-dvh bg-bg-page lg:h-dvh lg:overflow-hidden">
          <div
            ref={libGridRef}
            className="grid grid-cols-1 items-start gap-3 p-3 lg:h-full lg:grid-cols-[minmax(0,1fr)_360px] lg:items-stretch"
            style={isDesktop ? { gridTemplateColumns: `minmax(0,1fr) ${libWidth}px` } : undefined}
          >
            <section className="flex min-w-0 flex-col gap-3 lg:min-h-0">
              <ProgramHeader
                title={program.title}
                onTitle={setTitle}
                onAdd={addSession}
                onClear={onClear}
                saveState={saveState}
                retrying={retrying}
                onRetry={retry}
                programId={program.id}
                share={share}
                previewHref={previewHref}
                backHref={backHref}
                scheduleEnabled={scheduleEnabled}
                onToggleSchedule={() => setScheduleEnabled(!scheduleEnabled)}
                canAddSession={program.sessions.length < MAX_SESSIONS}
              />
              <SaveBanner
                state={saveState}
                onReload={() => {
                  discardUnsaved();
                  (reload ?? (() => window.location.reload()))();
                }}
                onRetry={retry}
                goneHref={goneHref ?? backHref}
                signInHref={signInHref}
              />
              <div
                className={`flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pb-40 ${stopped ? "pointer-events-none opacity-60" : ""}`}
                style={isDesktop ? undefined : { paddingBottom: sheetH + 96 }}
                aria-disabled={stopped || undefined}
              >
                <Card as="div" className="mx-auto w-full max-w-7xl">
                  <AutoGrowNote value={program.description ?? ""} onChange={setProgramDescription} placeholder={t.program.descriptionPlaceholder} />
                  {!hasAsana && <p className="text-caption text-ink-muted">{t.empty.body}</p>}
                </Card>
                {program.schedule?.enabled && (
                  <ScheduleTable
                    days={program.schedule.days}
                    sessions={program.sessions.map((s, i) => ({ id: s.id, label: s.title.trim() || `${t.schedule.setPrefix}${i + 1}` }))}
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
                      total={program.sessions.length}
                      sessionId={s.id}
                      title={s.title}
                      description={s.description}
                      slots={s.slots}
                      slotIds={s.slotIds}
                      onRename={(title) => renameSession(s.id, title)}
                      onSetDescription={(text) => setSessionDescription(s.id, text)}
                      onRemove={() => removeSession(s.id)}
                      canRemove={program.sessions.length > 1}
                      onMove={(delta) => moveSessionBy(s.id, delta)}
                      onClearSlot={(idx) => setSlot(s.id, idx, null)}
                      onSetSlotsCount={(n) => setSlotsCount(s.id, n)}
                      onSetSegments={(idx, segs) => setSegments(s.id, idx, segs)}
                      onSetSide={(idx, side) => setSlotSide(s.id, idx, side)}
                      onMoveSlot={(idx, delta) => moveSlotBy(s.id, idx, delta)}
                      hasPrevSession={i > 0}
                      hasNextSession={i < program.sessions.length - 1}
                      paintMode={paintMode}
                      isPainting={isPainting}
                      onPaintStart={(idx) => {
                        setIsPainting(true);
                        applyPaint(s.id, idx);
                      }}
                      onPaintEnter={(idx) => {
                        if (isPainting) applyPaint(s.id, idx);
                      }}
                      onPaint={(idx) => applyPaint(s.id, idx)}
                    />
                  ))}
                </SortableContext>
              </div>
            </section>

            {/* Desktop catalog. The wrapper is relative WITHOUT overflow so the resize grip in the gutter is not clipped. */}
            <div className="relative hidden lg:flex lg:min-h-0">
              <div
                onPointerDown={onLibHandleDown}
                onKeyDown={onLibHandleKey}
                role="separator"
                aria-orientation="vertical"
                aria-label={t.library.resize}
                aria-valuemin={LIB_MIN}
                aria-valuemax={LIB_MAX}
                aria-valuenow={libWidth}
                tabIndex={0}
                className="group/lh absolute inset-y-0 left-0 z-20 -ml-2 w-3 cursor-col-resize touch-none rounded-sm"
              >
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-pill transition-all duration-150 group-hover/lh:w-1 group-hover/lh:bg-ink/60 ${
                    libDragging ? "w-1 bg-ink" : "bg-transparent"
                  }`}
                />
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 top-1/2 flex h-9 w-3.5 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-[3px] rounded-pill bg-white shadow-sm ring-1 ring-toggle-off"
                >
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="size-[3px] rounded-full bg-ink-muted" />
                  ))}
                </span>
              </div>
              <aside className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-bg-card lg:min-h-0">
                <LibraryPanel tab={tab} onTab={setTab} onPick={pick} notice={notice} />
              </aside>
            </div>
          </div>

          {/* Mobile catalog: bottom sheet inside the DndContext so drags from it keep working. */}
          <div
            className="fixed inset-x-0 bottom-0 z-40 flex flex-col overflow-hidden rounded-t-xl bg-bg-card shadow-drawer lg:hidden"
            style={{ height: sheetH }}
          >
            <div
              onPointerDown={onSheetHandleDown}
              onKeyDown={onSheetHandleKey}
              role="separator"
              aria-orientation="horizontal"
              aria-label={t.library.sheet}
              aria-valuemin={SHEET_MIN}
              aria-valuenow={sheetH}
              tabIndex={0}
              className="flex shrink-0 cursor-grab touch-none select-none items-center justify-center py-3 active:cursor-grabbing"
            >
              <span className="h-1 w-10 rounded-pill bg-toggle-off" aria-hidden="true" />
            </div>
            <LibraryPanel tab={tab} onTab={setTab} onPick={pick} notice={notice} />
          </div>
        </div>

        {/* Library drop fades in place; slot reorder uses the default settle animation. */}
        <DragOverlay modifiers={[snapCenterToCursor]} dropAnimation={lastDragSource === "library" ? libraryDropAnimation : undefined}>
          {dragAsana ? (
            <div className="size-20 cursor-grabbing rounded-sm bg-white p-1.5 shadow-float ring-1 ring-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={dragAsana.src} alt={altFor(dragAsana.id)} draggable={false} className="h-full w-full object-contain" />
            </div>
          ) : null}
        </DragOverlay>

        {/* Floating paint dock: always one click away. Hidden while a segments popover is open. */}
        <div
          className={`pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 transition-opacity duration-150 ${
            openPopovers > 0 ? "invisible opacity-0" : "opacity-100"
          }`}
          style={isDesktop ? undefined : { bottom: sheetH + 12 }}
        >
          <div className="pointer-events-auto">
            <PaintToolbar
              paintColor={paintColor}
              onSelect={setPaintColor}
              onDone={() => {
                setPaintColor(null);
                setIsPainting(false);
              }}
            />
          </div>
        </div>
      </DndContext>
    </PaintDockGuardContext.Provider>
  );
}

/* ─── Paint toolbar ──────────────────────────────────────────────── */
function PaintToolbar({
  paintColor,
  onSelect,
  onDone,
}: {
  paintColor: SlotColor | "clear" | null;
  onSelect: (c: SlotColor | "clear" | null) => void;
  onDone: () => void;
}) {
  const t = useStrings();
  const active = paintColor !== null;
  const swatch = "relative inline-flex size-8 items-center justify-center rounded-full pointer-coarse:size-11";
  return (
    <div role="toolbar" aria-label={t.paint.dockLabel} className="inline-flex flex-wrap items-center gap-2 rounded-pill bg-bg-card px-4 py-2 shadow-float ring-1 ring-line">
      <span className="mr-1 text-micro uppercase tracking-wider text-ink-muted">{t.paint.label}</span>
      <div className="flex items-center gap-1">
        {PAINT_COLORS.map((c) => {
          const selected = paintColor === c.key;
          const label = t.paint.colors[c.key];
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onSelect(selected ? null : c.key)}
              aria-label={label}
              aria-pressed={selected}
              title={label}
              style={{ backgroundColor: c.swatch }}
              className={`${swatch} ${selected ? "scale-110 ring-2 ring-ink ring-offset-2" : "hover:scale-105"}`}
            />
          );
        })}
        <button
          type="button"
          onClick={() => onSelect(paintColor === "clear" ? null : "clear")}
          aria-label={t.paint.removeColor}
          aria-pressed={paintColor === "clear"}
          title={t.paint.removeColor}
          className={`${swatch} border-2 border-dashed border-ink-muted bg-white text-ink-2 ${paintColor === "clear" ? "scale-110 ring-2 ring-ink ring-offset-2" : "hover:scale-105"}`}
        >
          <XIcon size={10} />
        </button>
      </div>
      {active && (
        <>
          <span className="mx-1 hidden text-caption text-ink-muted sm:inline">{t.paint.hintAction}</span>
          <Button size="sm" onClick={onDone}>
            {t.paint.done}
          </Button>
        </>
      )}
    </div>
  );
}

/* ─── Header ─────────────────────────────────────────────────────── */
function SaveIndicator({ state, retrying, onRetry }: { state: SaveState; retrying: boolean; onRetry: () => void }) {
  const t = useStrings().save;
  const failed = state === "error" || state === "unauthorized" || state === "conflict" || state === "gone";
  let label: string | null = null;
  let dot = "";
  if (state === "saving") {
    label = t.saving;
    dot = "bg-amber-ink animate-pulse";
  } else if (state === "saved") {
    label = t.saved;
    dot = "bg-mint-ink";
  } else if (failed) {
    label = state === "error" && retrying ? t.retrying : t.error;
    dot = "bg-red-ink";
  }
  return (
    <div className="inline-flex items-center gap-2" role="status" aria-live="polite">
      {label && (
        <span className={`inline-flex items-center gap-1.5 text-caption font-bold ${failed ? "text-red-ink" : "text-ink-muted"}`}>
          <span className={`size-2 rounded-full ${dot}`} aria-hidden="true" />
          {label}
        </span>
      )}
      {(state === "error" || state === "unauthorized") && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          {t.retry}
        </Button>
      )}
    </div>
  );
}

function SaveBanner({
  state,
  onReload,
  onRetry,
  goneHref,
  signInHref,
}: {
  state: SaveState;
  onReload: () => void;
  onRetry: () => void;
  goneHref: string;
  signInHref: string;
}) {
  const t = useStrings().save;
  if (state !== "conflict" && state !== "gone" && state !== "unauthorized") return null;
  return (
    <Card tone="amber" as="div" role="alert" className="mx-auto w-full max-w-7xl">
      {state === "conflict" && (
        <>
          <h2>{t.conflictTitle}</h2>
          <p>{t.conflictBody}</p>
          <p>{t.conflictNote}</p>
          <div>
            <Button onClick={onReload}>{t.conflictReload}</Button>
          </div>
        </>
      )}
      {state === "gone" && (
        <>
          <h2>{t.goneTitle}</h2>
          <p>{t.goneBody}</p>
          <div>
            <Link href={goneHref} className="y-btn y-btn-primary">
              {t.goneLink}
            </Link>
          </div>
        </>
      )}
      {state === "unauthorized" && (
        <>
          <h2>{t.unauthorizedTitle}</h2>
          <p>{t.unauthorizedBody}</p>
          <div className="flex flex-wrap gap-2">
            <a href={signInHref} target="_blank" rel="noopener" className="y-btn y-btn-primary">
              {t.signIn}
            </a>
            <Button variant="secondary" onClick={onRetry}>
              {t.retry}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function ProgramHeader({
  title,
  onTitle,
  onAdd,
  onClear,
  saveState,
  retrying,
  onRetry,
  programId,
  share,
  previewHref,
  backHref,
  scheduleEnabled,
  onToggleSchedule,
  canAddSession,
}: {
  title: string;
  onTitle: (t: string) => void;
  onAdd: () => void;
  onClear: () => void;
  saveState: SaveState;
  retrying: boolean;
  onRetry: () => void;
  programId: string;
  share?: ShareConfig;
  previewHref: (programId: string) => string;
  backHref: string;
  scheduleEnabled: boolean;
  onToggleSchedule: () => void;
  canAddSession: boolean;
}) {
  const t = useStrings();
  const p = t.program;
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl bg-bg-card px-4 py-3 sm:px-5">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Link href={backHref} aria-label={p.back} title={p.back} className="y-btn y-btn-ghost y-btn-sm shrink-0">
          <ArrowLeftIcon size={16} />
          <span className="hidden sm:inline">{p.back}</span>
        </Link>
        <input
          value={title}
          maxLength={TITLE_MAX}
          onChange={(e) => onTitle(e.target.value)}
          placeholder={p.titlePlaceholder}
          aria-label={p.titleLabel}
          className="min-h-11 min-w-0 flex-1 rounded-sm bg-transparent px-2 text-h3 text-ink placeholder:text-ink-muted"
        />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0">
        <SaveIndicator state={saveState} retrying={retrying} onRetry={onRetry} />
        <div className="inline-flex items-center gap-2">
          <span className="hidden text-caption font-bold text-ink-2 sm:inline" aria-hidden="true">
            {t.schedule.toggle}
          </span>
          <Toggle
            label={scheduleEnabled ? t.schedule.hide : t.schedule.show}
            checked={scheduleEnabled}
            onChange={onToggleSchedule}
          />
        </div>
        {share && <ShareControl planId={programId} share={share} />}
        <Link href={previewHref(programId)} target="_blank" rel="noopener" className="y-btn y-btn-secondary y-btn-sm">
          <EyeIcon size={16} />
          {p.preview}
        </Link>
        <Button size="sm" variant="ghost" onClick={onClear}>
          {p.clear}
        </Button>
        <Button size="sm" onClick={onAdd} disabled={!canAddSession}>
          {p.addSession}
        </Button>
      </div>
    </header>
  );
}

