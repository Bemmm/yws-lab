"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { MinusIcon, PlusIcon, XIcon } from "./icons";
import {
  SCHEDULE_FILL,
  SCHEDULE_MAX_DAYS,
  SCHEDULE_MIN_DAYS,
  SCHEDULE_ROW_LABEL_MAX,
  type ScheduleCell,
  type ScheduleRow,
  type SlotColor,
} from "./model";
import { bandStyle, inkColor } from "./palette";
import { useStrings } from "./strings";
import { ICON_BTN } from "./ui";

const CELL = "block size-8 rounded-[6px] border border-line transition-colors touch-none pointer-coarse:size-11";

export function ScheduleTable({
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
  days: number;
  sessions: { id: string; label: string }[];
  cells: Record<string, ScheduleCell[]>;
  rows: ScheduleRow[];
  onSetCell: (rowKey: string, dayIndex: number, color: SlotColor | null) => void;
  onSetDays: (days: number) => void;
  onAddRow: () => void;
  onRemoveRow: (rowId: string) => void;
  onRenameRow: (rowId: string, label: string) => void;
}) {
  const s = useStrings().schedule;
  const [painting, setPainting] = useState(false);
  // The first cell decides the stroke: empty -> fill, filled -> erase, so a drag paints OR clears a run.
  const paintValRef = useRef<SlotColor | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  useEffect(() => {
    if (!painting) return;
    const up = () => setPainting(false);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [painting]);

  function startPaint(rowKey: string, day: number, current: SlotColor | null, fill: SlotColor) {
    const next = current ? null : fill;
    paintValRef.current = next;
    setPainting(true);
    onSetCell(rowKey, day, next);
  }
  function enterPaint(rowKey: string, day: number) {
    if (painting) onSetCell(rowKey, day, paintValRef.current);
  }
  /** Space/Enter on a focused cell (click with detail 0) toggles it; pointer clicks are handled on pointerdown. */
  function keyboardToggle(e: React.MouseEvent, rowKey: string, day: number, current: SlotColor | null, fill: SlotColor) {
    if (e.detail !== 0) return;
    onSetCell(rowKey, day, current ? null : fill);
  }
  function onCellKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    const dr = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    const dd = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dr && !dd) return;
    const r = Number(e.currentTarget.dataset.r);
    const d = Number(e.currentTarget.dataset.d);
    const next = tableRef.current?.querySelector<HTMLElement>(`[data-r="${r + dr}"][data-d="${d + dd}"]`);
    if (next) {
      e.preventDefault();
      next.focus();
    }
  }

  const dayList = Array.from({ length: days }, (_, i) => i);

  return (
    <Card as="section" className="mx-auto w-full max-w-7xl">
      <header className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="mr-auto min-w-0">
          <h2 className="text-h3">{s.title}</h2>
          <p className="text-caption text-ink-muted">{s.caption}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={onAddRow}>
          {s.addRow}
        </Button>
        <div className="inline-flex items-center rounded-pill bg-bg-page">
          <button type="button" aria-label={s.removeDay} title={s.removeDay} disabled={days <= SCHEDULE_MIN_DAYS} onClick={() => onSetDays(days - 1)} className={ICON_BTN}>
            <MinusIcon size={12} />
          </button>
          <span className="min-w-12 text-center text-caption tabular-nums text-ink-2" aria-live="polite">
            {days} {s.dayPrefix}
          </span>
          <button type="button" aria-label={s.addDay} title={s.addDay} disabled={days >= SCHEDULE_MAX_DAYS} onClick={() => onSetDays(days + 1)} className={ICON_BTN}>
            <PlusIcon size={12} />
          </button>
        </div>
      </header>

      <div className="overflow-x-auto">
        {sessions.length === 0 ? (
          <p className="py-6 text-center text-caption text-ink-muted">{s.emptyRows}</p>
        ) : (
          <table ref={tableRef} className="border-separate border-spacing-0.5">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-bg-card" aria-hidden="true" />
                {dayList.map((d) => (
                  <th key={d} scope="col" className="px-0.5 pb-1 text-center text-micro text-ink-muted">
                    {s.dayPrefix}
                    {d + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map((sess, ri) => {
                const row = cells[sess.id] ?? [];
                return (
                  <tr key={sess.id}>
                    <th scope="row" className="sticky left-0 z-10 bg-bg-card pr-2 text-right align-middle text-micro text-ink-2">
                      <span className="block max-w-32 truncate" title={sess.label}>
                        {sess.label}
                      </span>
                    </th>
                    {dayList.map((d) => {
                      const color = row[d] ?? null;
                      return (
                        <td key={d} className="p-0">
                          <button
                            type="button"
                            data-r={ri}
                            data-d={d}
                            aria-label={`${sess.label} · ${s.dayPrefix}${d + 1}`}
                            aria-pressed={Boolean(color)}
                            onPointerDown={(e) => {
                              e.preventDefault();
                              startPaint(sess.id, d, color, SCHEDULE_FILL);
                            }}
                            onPointerEnter={() => enterPaint(sess.id, d)}
                            onClick={(e) => keyboardToggle(e, sess.id, d, color, SCHEDULE_FILL)}
                            onKeyDown={onCellKeyDown}
                            style={bandStyle(color)}
                            className={`${CELL} ${color ? "border-transparent" : "bg-white hover:bg-black/5"}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {rows.map((r, j) => {
                const ri = sessions.length + j;
                const rowCells = cells[r.id] ?? [];
                const size = Math.max(5, (r.label.length || s.rowPlaceholder.length) + 1);
                return (
                  <tr key={r.id}>
                    <th scope="row" className="sticky left-0 z-10 bg-bg-card pr-2 text-right align-middle">
                      <input
                        value={r.label}
                        size={size}
                        maxLength={SCHEDULE_ROW_LABEL_MAX}
                        placeholder={s.rowPlaceholder}
                        aria-label={s.rowPlaceholder}
                        onChange={(e) => onRenameRow(r.id, e.target.value)}
                        onPointerDown={(e) => e.stopPropagation()}
                        style={{ color: inkColor(r.color) }}
                        className="min-h-8 min-w-0 rounded-sm bg-transparent px-1 text-right text-micro placeholder:text-ink-muted"
                      />
                    </th>
                    {dayList.map((d) => {
                      const color = rowCells[d] ?? null;
                      return (
                        <td key={d} className="p-0">
                          <button
                            type="button"
                            data-r={ri}
                            data-d={d}
                            aria-label={`${r.label || s.rowPlaceholder} · ${s.dayPrefix}${d + 1}`}
                            aria-pressed={Boolean(color)}
                            onPointerDown={(e) => {
                              e.preventDefault();
                              startPaint(r.id, d, color, r.color);
                            }}
                            onPointerEnter={() => enterPaint(r.id, d)}
                            onClick={(e) => keyboardToggle(e, r.id, d, color, r.color)}
                            onKeyDown={onCellKeyDown}
                            style={bandStyle(color)}
                            className={`${CELL} ${color ? "border-transparent" : "bg-white hover:bg-black/5"}`}
                          />
                        </td>
                      );
                    })}
                    <td className="p-0 pl-1 align-middle">
                      <button type="button" aria-label={s.removeRow} title={s.removeRow} onClick={() => onRemoveRow(r.id)} className={`${ICON_BTN} hover:text-red-ink`}>
                        <XIcon size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
