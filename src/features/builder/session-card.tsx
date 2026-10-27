"use client";

import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { useEffect, useRef } from "react";
import { Card } from "@/components/Card";
import { useConfirm } from "@/components/ConfirmDialog";
import { format } from "@/i18n/format";
import { ArrowDownIcon, ArrowUpIcon, GripIcon, MinusIcon, PlusIcon, XIcon } from "./icons";
import { DESCRIPTION_MAX, MAX_SLOTS, MIN_SLOTS, SESSION_TITLE_MAX, type Segment, type Slot, type SlotSide } from "./model";
import { DropSlot } from "./slot";
import { useStrings } from "./strings";
import { ICON_BTN } from "./ui";

export type SessionDragData = { type: "session"; sessionId: string; label: string };

export type SessionCardProps = {
  index: number;
  total: number;
  sessionId: string;
  title: string;
  description?: string;
  slots: Slot[];
  slotIds: string[];
  onRename: (title: string) => void;
  onSetDescription: (text: string) => void;
  onRemove: () => void;
  canRemove: boolean;
  onMove: (delta: -1 | 1) => void;
  onClearSlot: (idx: number) => void;
  onSetSlotsCount: (n: number) => void;
  onSetSegments: (idx: number, segments: Segment[]) => void;
  onSetSide: (idx: number, side: SlotSide | null) => void;
  onMoveSlot: (idx: number, delta: -1 | 1) => void;
  /** Whether a neighbouring set exists to move a slot into (for "earlier" on the first / "later" on the last slot). */
  hasPrevSession: boolean;
  hasNextSession: boolean;
  paintMode: boolean;
  isPainting: boolean;
  onPaintStart: (slotIndex: number) => void;
  onPaintEnter: (slotIndex: number) => void;
  onPaint: (slotIndex: number) => void;
};

export function SessionCard(props: SessionCardProps) {
  const { index, total, sessionId, title, description, slots, slotIds } = props;
  const t = useStrings();
  const confirm = useConfirm();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sessionId,
    data: { type: "session", sessionId, label: title.trim() || format(t.slot.position, { n: index }) } satisfies SessionDragData,
  });
  const style = { transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined, transition };
  const filled = slots.filter((s) => s !== null).length;

  async function shrink() {
    if (slots.length <= MIN_SLOTS) return;
    // Shrinking asks only when the last slot holds something (breath-only counts).
    if (slots[slots.length - 1] !== null) {
      const ok = await confirm({
        title: t.session.shrinkTitle,
        body: t.session.confirmShrink,
        confirmLabel: t.session.shrinkConfirm,
        cancelLabel: t.session.cancel,
      });
      if (!ok) return;
    }
    props.onSetSlotsCount(slots.length - 1);
  }
  function grow() {
    if (slots.length < MAX_SLOTS) props.onSetSlotsCount(slots.length + 1);
  }
  async function remove() {
    if (slots.some((s) => s?.asana)) {
      const ok = await confirm({
        title: format(t.session.removeConfirmTitle, { title: title.trim() || String(index) }),
        body: t.session.removeConfirmBody,
        confirmLabel: t.session.removeConfirm,
        cancelLabel: t.session.cancel,
      });
      if (!ok) return;
    }
    props.onRemove();
  }

  return (
    <div ref={setNodeRef} style={style} className={`mx-auto w-full max-w-7xl ${isDragging ? "relative z-10 opacity-90" : ""}`}>
      <Card as="section" className={isDragging ? "shadow-float" : ""}>
        <header className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              {...attributes}
              {...listeners}
              aria-label={t.session.dragHandle}
              title={t.session.dragHandle}
              className={`${ICON_BTN} -ml-1 cursor-grab touch-none active:cursor-grabbing`}
            >
              <GripIcon />
            </button>
            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-pill bg-ink text-micro text-white tabular-nums">
              {index}
            </span>
            <input
              value={title}
              maxLength={SESSION_TITLE_MAX}
              aria-label={t.session.titleLabel}
              onChange={(e) => props.onRename(e.target.value)}
              className="min-h-9 min-w-0 flex-1 rounded-sm bg-transparent px-1 text-body-strong text-ink"
            />
            <SlotsCounter filled={filled} total={slots.length} onDec={shrink} onInc={grow} />
          </div>
          <div className="flex shrink-0 items-center">
            <button type="button" className={ICON_BTN} disabled={index === 1} onClick={() => props.onMove(-1)} aria-label={t.session.moveUp} title={t.session.moveUp}>
              <ArrowUpIcon />
            </button>
            <button type="button" className={ICON_BTN} disabled={index === total} onClick={() => props.onMove(1)} aria-label={t.session.moveDown} title={t.session.moveDown}>
              <ArrowDownIcon />
            </button>
            {props.canRemove && (
              <button type="button" onClick={remove} aria-label={t.session.removeTitle} title={t.session.removeTitle} className={`${ICON_BTN} hover:text-red-ink`}>
                <XIcon />
              </button>
            )}
          </div>
        </header>
        <AutoGrowNote value={description ?? ""} onChange={props.onSetDescription} placeholder={t.session.descriptionPlaceholder} />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <SortableContext items={slotIds} strategy={rectSortingStrategy}>
            {slots.map((slot, idx) => (
              <DropSlot
                key={slotIds[idx]}
                slotId={slotIds[idx]!}
                sessionId={sessionId}
                slotIndex={idx}
                slot={slot}
                onClear={() => props.onClearSlot(idx)}
                onSetSegments={(segs) => props.onSetSegments(idx, segs)}
                onSetSide={(side) => props.onSetSide(idx, side)}
                onMove={(delta) => props.onMoveSlot(idx, delta)}
                canMove={{
                  earlier: idx > 0 || props.hasPrevSession,
                  later: idx < slots.length - 1 || props.hasNextSession,
                }}
                paintMode={props.paintMode}
                isPainting={props.isPainting}
                onPaintStart={() => props.onPaintStart(idx)}
                onPaintEnter={() => props.onPaintEnter(idx)}
                onPaint={() => props.onPaint(idx)}
              />
            ))}
          </SortableContext>
        </div>
      </Card>
    </div>
  );
}

/** Borderless textarea that grows with its content (per-set note and the program-wide plan). */
export function AutoGrowNote({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      maxLength={DESCRIPTION_MAX}
      aria-label={placeholder}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full resize-none overflow-hidden rounded-sm bg-transparent px-1 py-1 text-caption text-ink-2 placeholder:text-ink-muted ${className}`}
    />
  );
}

function SlotsCounter({ filled, total, onDec, onInc }: { filled: number; total: number; onDec: () => void; onInc: () => void }) {
  const t = useStrings();
  return (
    <div className="inline-flex shrink-0 items-center">
      <button type="button" onClick={onDec} disabled={total <= MIN_SLOTS} aria-label={t.slotsCounter.remove} title={t.slotsCounter.remove} className={ICON_BTN}>
        <MinusIcon size={12} />
      </button>
      <span className="min-w-9 text-center text-micro tabular-nums text-ink-muted" aria-live="polite">
        {filled}/{total}
      </span>
      <button type="button" onClick={onInc} disabled={total >= MAX_SLOTS} aria-label={t.slotsCounter.add} title={t.slotsCounter.add} className={ICON_BTN}>
        <PlusIcon size={12} />
      </button>
    </div>
  );
}
