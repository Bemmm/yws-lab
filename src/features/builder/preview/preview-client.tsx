"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { Button } from "@/components/Button";
import { Logo } from "@/components/Logo";
import { Tabs } from "@/components/Tabs";
import { useT } from "@/i18n/client";
import { ArrowLeftIcon } from "../icons";
import { hasProgramContent, type Program, type Segment, type SegmentType, type Slot } from "../model";
import { EXACT_PRINT_COLORS, bandStyle, inkColor } from "../palette";
import { useAsanaAlt, useStrings } from "../strings";

/**
 * Read-only render of a plan in two views ("Table" = dense bordered printout, "Cards"), used by the owner
 * preview and the public share page. Print = window.print() (browser "Save as PDF").
 */

type View = "table" | "cards";
const VIEWS: View[] = ["table", "cards"];
const COLS = 6;

type TableCell = { slot: Slot; id: string };

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Cells for the table view: every slot up to the last meaningful one, padded to a full row. */
export function tableCells(slots: Slot[], slotIds: string[]): TableCell[] {
  let last = -1;
  slots.forEach((sl, idx) => {
    if (sl && (sl.asana || sl.color || (sl.segments?.length ?? 0) > 0)) last = idx;
  });
  if (last < 0) return [];
  const cells: TableCell[] = slots.slice(0, last + 1).map((slot, idx) => ({ slot, id: slotIds[idx] ?? String(idx) }));
  while (cells.length % COLS !== 0) cells.push({ slot: null, id: `pad-${cells.length}` });
  return cells;
}

/** "S-3 D-3 S-3" */
export function fmtSegments(segments: Segment[] | undefined): string {
  if (!segments || segments.length === 0) return "";
  return segments.map((s) => `${s.type}-${s.count}`).join(" ");
}

function filledItems(slots: Slot[], slotIds: string[]) {
  return slots
    .map((slot, idx) => ({ slot, id: slotIds[idx] ?? String(idx) }))
    .filter((x): x is { slot: NonNullable<Slot>; id: string } => !!x.slot?.asana);
}

export function PreviewClient({
  initialProgram,
  publicView = false,
  backHref,
}: {
  initialProgram: Program | null;
  /** Public share page: no back link, YWS Lab wordmark, no owner identity. */
  publicView?: boolean;
  backHref?: string;
}) {
  const t = useStrings();
  const app = useT().app;
  const tx = t.preview;
  const program = initialProgram;
  const [view, setView] = useState<View>("table");
  const hasContent = !!program && hasProgramContent(program);

  return (
    <div className="min-h-dvh bg-bg-page print:bg-bg-card">
      {/* Zero @page margin drops the browser's print header/footer; the views keep their own padding. */}
      <style>{`@media print { @page { margin: 0; } }`}</style>
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 bg-bg-card/95 px-4 py-2 backdrop-blur print:hidden sm:px-6">
        {publicView || !backHref ? (
          <span className="inline-flex shrink-0 items-center gap-2 text-body-strong">
            <Logo alt="" size={36} />
            {app.name}
          </span>
        ) : (
          <Link href={backHref} aria-label={tx.back} className="y-btn y-btn-ghost y-btn-sm shrink-0">
            <ArrowLeftIcon size={16} />
            <span className="hidden sm:inline">{tx.back}</span>
          </Link>
        )}
        <h1 className="order-last w-full min-w-0 truncate text-center text-body-strong sm:order-none sm:w-auto sm:flex-1">
          {program?.title ?? ""}
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          {publicView && <span className="hidden text-caption text-ink-muted sm:inline">{tx.publicBadge}</span>}
          <nav aria-label={tx.view}>
            <Tabs items={[tx.viewTable, tx.viewCards]} value={VIEWS.indexOf(view)} onChange={(i) => setView(VIEWS[i]!)} />
          </nav>
          <Button size="sm" onClick={() => window.print()}>
            {tx.print}
          </Button>
        </div>
      </header>

      {!hasContent || !program ? (
        <p className="py-20 text-center text-ink-muted">{tx.empty}</p>
      ) : view === "table" ? (
        <TableView program={program} />
      ) : (
        <CardsView program={program} />
      )}
    </div>
  );
}

/* ─── Schedule grid (read-only mirror of the builder table) ─────────── */
function PreviewSchedule({ program }: { program: Program }) {
  const s = useStrings().schedule;
  const sch = program.schedule;
  if (!sch?.enabled || program.sessions.length === 0) return null;
  const days = Array.from({ length: sch.days }, (_, i) => i);
  const cell = "size-8 rounded-[6px] border";
  return (
    <section className="flex break-inside-avoid flex-col gap-3">
      <h2 className="text-h3">{s.title}</h2>
      <div className="overflow-x-auto print:overflow-visible">
        <table className="border-separate border-spacing-0.5">
          <thead>
            <tr>
              <th aria-hidden="true" />
              {days.map((d) => (
                <th key={d} scope="col" className="px-0.5 pb-1 text-center text-micro text-ink-muted">
                  {s.dayPrefix}
                  {d + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {program.sessions.map((sess, i) => {
              const row = sch.cells[sess.id] ?? [];
              const label = sess.title.trim() || `${s.setPrefix}${i + 1}`;
              return (
                <tr key={sess.id}>
                  <th scope="row" className="pr-2 text-right align-middle text-micro text-ink-2">
                    <span className="block max-w-32 truncate" title={label}>
                      {label}
                    </span>
                  </th>
                  {days.map((d) => {
                    const color = row[d] ?? null;
                    return (
                      <td key={d} className="p-0">
                        <div style={bandStyle(color)} className={`${cell} ${color ? "border-transparent" : "border-ink/25 bg-bg-card"}`} />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {(sch.rows ?? []).map((r) => {
              const rowCells = sch.cells[r.id] ?? [];
              return (
                <tr key={r.id}>
                  <th scope="row" className="pr-2 text-right align-middle text-micro" style={{ color: inkColor(r.color) }}>
                    <span className="block max-w-32 truncate" title={r.label.trim()}>
                      {r.label.trim()}
                    </span>
                  </th>
                  {days.map((d) => {
                    const color = rowCells[d] ?? null;
                    return (
                      <td key={d} className="p-0">
                        <div style={bandStyle(color)} className={`${cell} ${color ? "border-transparent" : "border-ink/25 bg-bg-card"}`} />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ─── Table: bordered, dense printout ──────────────────────────────── */
function TableView({ program }: { program: Program }) {
  return (
    <div
      style={EXACT_PRINT_COLORS}
      className="mx-auto flex max-w-4xl flex-col gap-9 bg-bg-card px-6 py-10 text-ink sm:px-10 lg:my-4 lg:rounded-xl print:my-0 print:rounded-none"
    >
      {(program.title || program.description) && (
        <header className="flex break-inside-avoid flex-col gap-2">
          <h2 className="text-h2">{program.title}</h2>
          {program.description && <p className="max-w-2xl whitespace-pre-line text-ink-2">{program.description}</p>}
        </header>
      )}
      <PreviewSchedule program={program} />
      {program.sessions.map((s) => {
        const cells = tableCells(s.slots, s.slotIds);
        if (cells.length === 0 && !s.description) return null;
        return (
          <section key={s.id} className="flex break-inside-avoid flex-col gap-3">
            <h3 className="text-body-strong">{s.title}</h3>
            {s.description && <p className="max-w-2xl whitespace-pre-line text-ink-2">{s.description}</p>}
            {cells.length > 0 && <Grid cells={cells} />}
          </section>
        );
      })}
    </div>
  );
}

function Grid({ cells }: { cells: TableCell[] }) {
  const altFor = useAsanaAlt();
  // 1px grid lines: the container gets left+top, every cell adds right+bottom (no doubled lines).
  return (
    <div className="border-l border-t border-ink/30">
      {chunk(cells, COLS).map((row, ri) => (
        <Fragment key={ri}>
          <div className="grid grid-cols-6">
            {row.map(({ slot, id }) => (
              <div key={id} className={`relative aspect-[4/3] border-b border-r border-ink/30 ${slot?.asana ? "bg-asana-bg" : ""}`}>
                {slot?.asana && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={slot.asana.src} alt={altFor(slot.asana.id)} draggable={false} className="absolute inset-0 h-full w-full select-none object-contain p-2" />
                    {slot.side && <span className="absolute right-1.5 top-1 text-micro leading-none">{slot.side}</span>}
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-6">
            {row.map(({ slot, id }) => (
              <div
                key={id}
                style={bandStyle(slot?.color)}
                className="flex min-h-7 items-center justify-center border-b border-r border-ink/30 px-1 text-micro leading-none tabular-nums"
              >
                {fmtSegments(slot?.segments)}
              </div>
            ))}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

/* ─── Cards ─────────────────────────────────────────────────────────── */
function CardsView({ program }: { program: Program }) {
  return (
    <div style={EXACT_PRINT_COLORS} className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 sm:px-6 print:max-w-none print:gap-3 print:px-8 print:py-7">
      {(program.title || program.description) && (
        <header className="flex flex-col gap-2">
          <h2 className="text-h1">{program.title}</h2>
          {program.description && <p className="max-w-3xl whitespace-pre-line rounded-lg bg-sand px-4 py-3 text-sand-ink">{program.description}</p>}
        </header>
      )}
      <PreviewSchedule program={program} />
      {program.sessions.map((s, i) => {
        const items = filledItems(s.slots, s.slotIds);
        if (items.length === 0 && !s.description) return null;
        return (
          <section key={s.id} className="flex break-inside-avoid flex-col gap-3 rounded-xl bg-bg-card p-5 print:p-3">
            <header className="flex items-center gap-2.5">
              <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-pill bg-action-bg text-micro text-action-fg tabular-nums">{i + 1}</span>
              <h3 className="min-w-0 truncate text-h3">{s.title}</h3>
            </header>
            {s.description && <p className="whitespace-pre-line rounded-lg bg-sand px-4 py-3 text-sand-ink">{s.description}</p>}
            {items.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6 print:grid-cols-6 print:gap-2">
                {items.map(({ slot, id }) => (
                  <CardCell key={id} slot={slot} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function SegShape({ type }: { type: SegmentType }) {
  if (type === "S") return <span aria-hidden="true" className="inline-block size-2 bg-current opacity-80" />;
  return (
    <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true">
      <polygon points="6,1 11,11 1,11" fill="currentColor" />
    </svg>
  );
}

function CardCell({ slot }: { slot: NonNullable<Slot> }) {
  const altFor = useAsanaAlt();
  const asana = slot.asana!;
  const segments = slot.segments ?? [];
  const style = bandStyle(slot.color);
  return (
    <div className="overflow-hidden rounded-md bg-bg-card ring-1 ring-line">
      <div className="relative aspect-square bg-asana-bg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asana.src} alt={altFor(asana.id)} draggable={false} className="absolute inset-0 h-full w-full select-none object-contain p-3" />
        {slot.side && (
          <span className="absolute left-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-sm bg-bg-card text-micro ring-1 ring-line">{slot.side}</span>
        )}
      </div>
      {(segments.length > 0 || style) && (
        <div style={style} className="flex min-h-7 items-center justify-center gap-2 border-t border-line px-2 py-1.5 text-micro leading-none tabular-nums">
          {segments.map((seg, j) => (
            <span key={j} className="inline-flex items-center gap-1">
              <SegShape type={seg.type} />
              {seg.count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
