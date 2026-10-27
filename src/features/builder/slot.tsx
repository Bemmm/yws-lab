"use client";

import { useDndContext, type DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { useState } from "react";
import { format } from "@/i18n/format";
import { ArrowLeftIcon, ArrowRightIcon, SwapIcon, XIcon } from "./icons";
import type { Segment, Slot, SlotColor, SlotSide } from "./model";
import { bandStyle } from "./palette";
import { SegmentShape, SegmentsPopover } from "./segments-popover";
import { useAsanaAlt, useStrings } from "./strings";
import { OVERLAY_BTN } from "./ui";

export type DragData =
  | { source: "library"; asanaId: string; label: string }
  | { source: "slot"; sessionId: string; slotIndex: number; asanaId?: string; label: string };

const REVEAL = "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100";

export type DropSlotProps = {
  slotId: string;
  sessionId: string;
  slotIndex: number;
  slot: Slot;
  onClear: () => void;
  onSetSegments: (segments: Segment[]) => void;
  onSetSide: (side: SlotSide | null) => void;
  onMove: (delta: -1 | 1) => void;
  canMove: { earlier: boolean; later: boolean };
  paintMode: boolean;
  isPainting: boolean;
  onPaintStart: () => void;
  onPaintEnter: () => void;
  onPaint: () => void;
};

/** One slot: sortable (filled slots are draggable; empty ones are drop targets). */
export function DropSlot(props: DropSlotProps) {
  const { slotId, sessionId, slotIndex, slot, paintMode } = props;
  const t = useStrings();
  const hasAsana = !!slot?.asana;
  const position = format(t.slot.position, { n: slotIndex + 1 });
  const { setNodeRef, attributes, listeners, transform, transition, isOver, isDragging } = useSortable({
    id: slotId,
    data: { sessionId, slotIndex, source: "slot", asanaId: slot?.asana?.id, label: position } satisfies DragData,
    disabled: { draggable: paintMode || !hasAsana, droppable: false },
  });
  // The "will replace" veil is only meaningful for a fresh asana dragged from the catalog.
  const { active } = useDndContext();
  const isLibraryDrag = (active?.data.current as DragData | undefined)?.source === "library";
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        // transition-colors only: a blanket `transition` animates transform and fights dnd-kit.
        "relative flex flex-col rounded-sm transition-colors",
        hasAsana
          ? `bg-asana-bg outline-2 ${isOver && isLibraryDrag ? "outline outline-ink" : "outline-transparent"}`
          : `border-2 border-dashed ${isOver ? "border-ink bg-bg-card" : "border-toggle-off bg-bg-page/50"}`,
        isDragging ? "z-10" : "",
      ].join(" ")}
    >
      {hasAsana && isOver && !isDragging && isLibraryDrag && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-sm bg-bg-card/80 text-ink ring-2 ring-ink">
          <SwapIcon />
        </div>
      )}
      {hasAsana ? (
        <FilledSlot {...props} slot={slot!} position={position} dragAttributes={attributes} dragListeners={listeners} isDragging={isDragging} />
      ) : (
        <EmptyWithBreath segments={slot?.segments ?? []} onSetSegments={props.onSetSegments} position={position} />
      )}
    </div>
  );
}

/** Empty slot: still allows laying out the breath rhythm before any asana. */
function EmptyWithBreath({
  segments,
  onSetSegments,
  position,
}: {
  segments: Segment[];
  onSetSegments: (segs: Segment[]) => void;
  position: string;
}) {
  const t = useStrings();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex w-full flex-col">
      <div className="aspect-square" />
      <SegmentsRow
        segments={segments}
        label={position}
        onClick={() => setOpen(true)}
        paintMode={false}
        isPainting={false}
        onPaintStart={() => {}}
        onPaintEnter={() => {}}
        onPaint={() => {}}
      />
      {open && (
        <SegmentsPopover
          asanaLabel={`${position} ${t.slot.emptyLabel}`}
          initial={segments}
          onSave={(s) => {
            onSetSegments(s);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function FilledSlot({
  slot,
  position,
  dragAttributes,
  dragListeners,
  isDragging,
  onClear,
  onSetSegments,
  onSetSide,
  onMove,
  canMove,
  paintMode,
  isPainting,
  onPaintStart,
  onPaintEnter,
  onPaint,
}: DropSlotProps & {
  slot: NonNullable<Slot>;
  position: string;
  dragAttributes: DraggableAttributes;
  dragListeners: SyntheticListenerMap | undefined;
  isDragging: boolean;
}) {
  const t = useStrings();
  const altFor = useAsanaAlt();
  const asana = slot.asana!;
  const alt = altFor(asana.id);
  const [open, setOpen] = useState(false);
  const segments = slot.segments ?? [];

  // Paint mode swaps the drag listeners for paint handlers. One object spread on purpose: an explicit
  // onPointerDown after the spread would override the drag activator with undefined.
  const handle = paintMode
    ? {
        role: "button",
        tabIndex: 0,
        "aria-label": `${position}: ${alt}`,
        onPointerDown: (e: React.PointerEvent) => {
          e.preventDefault();
          onPaintStart();
        },
        onPointerEnter: isPainting ? () => onPaintEnter() : undefined,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onPaint();
          }
        },
      }
    : {
        ...dragAttributes,
        ...dragListeners,
        // dnd-kit's keyboard sensor would swallow Enter/Space from the nested clear/move/side buttons (preventDefault
        // on keydown cancels their click); only start a keyboard drag when the handle itself has focus.
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.target === e.currentTarget) dragListeners?.onKeyDown?.(e);
        },
        // dnd-kit defaults to role="button", which may not contain the nested clear/move/side controls (axe: nested-interactive).
        role: "group",
        "aria-label": `${position}: ${alt}`,
        title: t.slot.dragHint,
      };

  return (
    <div className={`group relative flex h-full w-full flex-col rounded-sm ${isDragging ? "opacity-30" : ""}`}>
      <div
        {...handle}
        className={`relative aspect-square flex-1 touch-none rounded-sm ${paintMode ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- local school-owned SVGs, no optimization needed */}
        <img src={asana.src} alt={alt} draggable={false} className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain p-2" />
        {!paintMode && <SideRadio side={slot.side} onChange={onSetSide} />}
        {!paintMode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={t.slot.clear}
            title={t.slot.clear}
            className={`${OVERLAY_BTN} absolute right-1 top-1 ${REVEAL}`}
          >
            <XIcon size={11} />
          </button>
        )}
        {!paintMode && (
          <>
            <button
              type="button"
              disabled={!canMove.earlier}
              onClick={(e) => {
                e.stopPropagation();
                onMove(-1);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={t.slot.moveEarlier}
              title={t.slot.moveEarlier}
              className={`${OVERLAY_BTN} absolute bottom-1 left-1 ${REVEAL}`}
            >
              <ArrowLeftIcon size={12} />
            </button>
            <button
              type="button"
              disabled={!canMove.later}
              onClick={(e) => {
                e.stopPropagation();
                onMove(1);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={t.slot.moveLater}
              title={t.slot.moveLater}
              className={`${OVERLAY_BTN} absolute bottom-1 right-1 ${REVEAL}`}
            >
              <ArrowRightIcon size={12} />
            </button>
          </>
        )}
      </div>

      <SegmentsRow
        segments={segments}
        color={slot.color}
        label={position}
        onClick={() => setOpen(true)}
        paintMode={paintMode}
        isPainting={isPainting}
        onPaintStart={onPaintStart}
        onPaintEnter={onPaintEnter}
        onPaint={onPaint}
      />
      {open && (
        <SegmentsPopover
          asanaLabel={alt}
          initial={segments}
          onSave={(s) => {
            onSetSegments(s);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/** Side selector: L toggle / free-text mark (max 3 chars) / R toggle. Top-left of a filled slot. */
function SideRadio({ side, onChange }: { side?: SlotSide; onChange: (s: SlotSide | null) => void }) {
  const s = useStrings().slot;
  const current = side ?? null;
  const customVal = current && current !== "L" && current !== "R" ? current : "";
  const btn = (active: boolean) =>
    `inline-flex size-6 items-center justify-center text-micro pointer-coarse:size-11 ${
      active ? "bg-action-bg text-action-fg" : "text-ink-2 hover:bg-hover"
    }`;
  return (
    <div
      role="group"
      aria-label={s.sideGroupLabel}
      onPointerDown={(e) => e.stopPropagation()}
      className={`absolute left-1 top-1 z-10 inline-flex items-center overflow-hidden rounded-sm bg-bg-card/95 shadow-sm ring-1 ring-line transition-opacity focus-within:opacity-100 pointer-coarse:opacity-100 ${
        current ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      }`}
    >
      <button
        type="button"
        aria-label={s.sideLeft}
        aria-pressed={current === "L"}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onChange(current === "L" ? null : "L");
        }}
        className={btn(current === "L")}
      >
        L
      </button>
      <input
        value={customVal}
        maxLength={3}
        placeholder="-"
        aria-label={s.sideBoth}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const v = e.target.value.trim();
          onChange(v ? v : null);
        }}
        className="h-6 w-7 bg-transparent text-center text-micro text-ink placeholder:text-ink-muted pointer-coarse:h-11 pointer-coarse:w-11"
      />
      <button
        type="button"
        aria-label={s.sideRight}
        aria-pressed={current === "R"}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onChange(current === "R" ? null : "R");
        }}
        className={btn(current === "R")}
      >
        R
      </button>
    </div>
  );
}

/** Footer row of every slot: "+ дихання" or chips like [■]3 [▲]3; coloured when painted. */
function SegmentsRow({
  segments,
  color,
  label,
  onClick,
  paintMode,
  isPainting,
  onPaintStart,
  onPaintEnter,
  onPaint,
}: {
  segments: Segment[];
  color?: SlotColor;
  label: string;
  onClick: () => void;
  paintMode: boolean;
  isPainting: boolean;
  onPaintStart: () => void;
  onPaintEnter: () => void;
  onPaint: () => void;
}) {
  const t = useStrings();
  const style = bandStyle(color);
  const summary = segments.length ? segments.map((s) => `${s.type}-${s.count}`).join(" ") : t.segments.addBreath;
  return (
    <button
      type="button"
      onClick={paintMode ? onPaint : onClick}
      onPointerDown={paintMode ? (e) => { e.preventDefault(); onPaintStart(); } : (e) => e.stopPropagation()}
      onPointerEnter={paintMode && isPainting ? () => onPaintEnter() : undefined}
      aria-label={`${label}: ${paintMode ? t.segments.paintTitle : t.segments.setBreathTitle} (${summary})`}
      title={paintMode ? t.segments.paintTitle : t.segments.setBreathTitle}
      style={style}
      className={`flex min-h-7 w-full items-center justify-center gap-2 rounded-b-sm border-t border-line px-1.5 text-micro tabular-nums pointer-coarse:min-h-11 ${
        style ? "border-transparent" : "text-ink-2 hover:bg-hover"
      } ${paintMode ? "cursor-crosshair" : ""}`}
    >
      {segments.length === 0 ? (
        <span className={style ? "" : "text-ink-muted"}>{t.segments.addBreath}</span>
      ) : (
        segments.map((seg, i) => (
          <span key={i} className="inline-flex items-center gap-0.5">
            <SegmentShape type={seg.type} />
            <span>{seg.count}</span>
          </span>
        ))
      )}
    </button>
  );
}
