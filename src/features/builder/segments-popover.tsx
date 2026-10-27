"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { MinusIcon, PlusIcon, XIcon } from "./icons";
import { MAX_SEGMENTS, SEGMENT_MAX_COUNT, type Segment, type SegmentType } from "./model";
import { useStrings } from "./strings";
import { ICON_BTN } from "./ui";

/**
 * The floating paint dock is fixed to the viewport bottom; a popover opening below a low slot would
 * land behind it. Open popovers register here so the dock hides while one is open.
 */
export const PaintDockGuardContext = createContext<{ open: () => void; close: () => void }>({
  open: () => {},
  close: () => {},
});

export function SegmentShape({ type, size = 8 }: { type: SegmentType; size?: number }) {
  if (type === "S") {
    return <span aria-hidden="true" className="inline-block bg-current" style={{ width: size, height: size }} />;
  }
  return (
    <svg width={size + 2} height={size + 2} viewBox="0 0 12 12" aria-hidden="true">
      <polygon points="6,1 11,11 1,11" fill="currentColor" />
    </svg>
  );
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function SegmentsPopover({
  asanaLabel,
  initial,
  onSave,
  onClose,
}: {
  asanaLabel: string;
  initial: Segment[];
  onSave: (segs: Segment[]) => void;
  onClose: () => void;
}) {
  const t = useStrings();
  const [drafts, setDrafts] = useState<Segment[]>(() => (initial.length > 0 ? initial : [{ type: "S", count: 3 }]));
  const ref = useRef<HTMLDivElement>(null);
  const draftsRef = useRef(drafts);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);
  const saveRef = useRef(onSave);
  const closeRef = useRef(onClose);
  useEffect(() => {
    saveRef.current = onSave;
    closeRef.current = onClose;
  }, [onSave, onClose]);

  const dockGuard = useContext(PaintDockGuardContext);
  useEffect(() => {
    dockGuard.open();
    return () => dockGuard.close();
  }, [dockGuard]);

  // Focus moves in on open and returns to the opener on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => opener?.focus?.();
  }, []);

  // Outside click closes WITHOUT applying; breaths are committed only via Done (or Enter).
  useEffect(() => {
    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) closeRef.current();
    }
    const timer = setTimeout(() => document.addEventListener("pointerdown", onPointer), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, []);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeRef.current();
      return;
    }
    // Enter confirms, except when it is activating a button.
    if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      saveRef.current(draftsRef.current.filter((s) => s.count > 0));
      return;
    }
    if (e.key === "Tab" && ref.current) {
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function update(i: number, patch: Partial<Segment>) {
    setDrafts((d) => d.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${t.segments.popoverAriaPrefix} · ${asanaLabel}`}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed left-4 right-4 top-1/2 z-[60] flex -translate-y-1/2 flex-col gap-2 rounded-lg bg-bg-card p-3 shadow-float ring-1 ring-line sm:absolute sm:left-1/2 sm:right-auto sm:top-full sm:z-30 sm:mt-2 sm:w-72 sm:-translate-x-1/2 sm:translate-y-0"
    >
      {/* Add stays pinned to the top so appending a segment never moves it away from the cursor. */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-micro uppercase tracking-wider text-ink-muted">
          {t.segments.popoverEyebrowPrefix} {MAX_SEGMENTS}
        </p>
        <Button
          size="sm"
          variant="secondary"
          disabled={drafts.length >= MAX_SEGMENTS}
          onClick={() => setDrafts((d) => (d.length >= MAX_SEGMENTS ? d : [...d, { type: "S", count: 3 }]))}
        >
          {t.segments.addSegment}
        </Button>
      </div>
      <ul className="flex flex-col gap-2">
        {drafts.map((seg, i) => (
          <li key={i} className="flex items-center gap-2">
            <TypeToggle value={seg.type} onChange={(next) => update(i, { type: next })} />
            <div className="inline-flex items-center rounded-sm bg-bg-page">
              <button
                type="button"
                aria-label={t.segments.minusOne}
                onClick={() => update(i, { count: Math.max(1, seg.count - 1) })}
                className={ICON_BTN}
              >
                <MinusIcon size={12} />
              </button>
              <input
                type="text"
                inputMode="numeric"
                value={seg.count}
                aria-label={t.segments.countLabel}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/[^0-9]/g, "").slice(0, 3));
                  update(i, { count: Math.max(1, Math.min(SEGMENT_MAX_COUNT, n || 1)) });
                }}
                onFocus={(e) => e.currentTarget.select()}
                className="h-8 w-11 bg-transparent px-1 text-center text-body tabular-nums pointer-coarse:h-11"
              />
              <button
                type="button"
                aria-label={t.segments.plusOne}
                onClick={() => update(i, { count: Math.min(SEGMENT_MAX_COUNT, seg.count + 1) })}
                className={ICON_BTN}
              >
                <PlusIcon size={12} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setDrafts((d) => d.filter((_, j) => j !== i))}
              aria-label={t.segments.removeSegment}
              className={`${ICON_BTN} ml-auto hover:text-red-ink`}
            >
              <XIcon size={12} />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button size="sm" variant="ghost" onClick={() => onSave([])}>
          {t.segments.clear}
        </Button>
        <Button size="sm" onClick={() => onSave(drafts.filter((s) => s.count > 0))}>
          {t.segments.done}
        </Button>
      </div>
    </div>
  );
}

function TypeToggle({ value, onChange }: { value: SegmentType; onChange: (next: SegmentType) => void }) {
  const t = useStrings();
  return (
    <div className="inline-flex shrink-0 overflow-hidden rounded-sm bg-bg-page">
      {(["S", "D"] as const).map((kind) => {
        const label = kind === "S" ? t.segments.typeStatic : t.segments.typeDynamic;
        return (
          <button
            key={kind}
            type="button"
            onClick={() => onChange(kind)}
            aria-pressed={value === kind}
            aria-label={label}
            title={label}
            className={`inline-flex h-8 w-10 items-center justify-center gap-1 text-caption font-bold pointer-coarse:h-11 pointer-coarse:w-11 ${
              value === kind ? "bg-action-bg text-action-fg" : "text-ink-2 hover:bg-hover"
            }`}
          >
            <SegmentShape type={kind} size={9} />
            <span aria-hidden="true">{kind}</span>
          </button>
        );
      })}
    </div>
  );
}
