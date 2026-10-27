'use client'

import Link from 'next/link'
import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react'
import { type Program, type Segment, type SegmentType, type Slot, type SlotColor } from './_lib/use-program'
import { useStrings } from './_lib/strings'

/**
 * Read-only preview of the workout program built next door, in two themes.
 * BE-wired: receives the program from the server page (loaded from
 * workout_programs by `?id`). Renders the program-wide plan + per-set notes.
 */

type Theme = 'yws' | 'papaya'

// Force background colours (breath/colour bands, badges, the description box) to
// render when printing — browsers drop backgrounds by default. Inherited, so set
// once on each theme root. Inline (not a Tailwind class) so it's guaranteed present.
const EXACT_PRINT_COLORS: CSSProperties = {
  printColorAdjust: 'exact',
  WebkitPrintColorAdjust: 'exact',
}

// Mirrors PAINT_COLORS in builder-client.tsx (slot footer colours). `soft` for
// Papaya badges, `band` (a touch stronger) for the YWS continuous colour bar,
// `dot` saturated for accents.
const COLOR_TINT: Record<SlotColor, { soft: string; band: string; text: string; dot: string }> = {
  amber: { soft: 'bg-amber-100', band: 'bg-amber-200', text: 'text-amber-900', dot: 'bg-amber-400' },
  emerald: { soft: 'bg-emerald-100', band: 'bg-emerald-200', text: 'text-emerald-900', dot: 'bg-emerald-400' },
  orange: { soft: 'bg-orange-100', band: 'bg-orange-200', text: 'text-orange-900', dot: 'bg-orange-400' },
  sky: { soft: 'bg-sky-100', band: 'bg-sky-200', text: 'text-sky-900', dot: 'bg-sky-400' },
  violet: { soft: 'bg-violet-100', band: 'bg-violet-200', text: 'text-violet-900', dot: 'bg-violet-400' },
  rose: { soft: 'bg-rose-100', band: 'bg-rose-200', text: 'text-rose-900', dot: 'bg-rose-400' },
}

type TableCell = { slot: Slot; id: string }

const YWS_COLS = 6

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// Cells for the YWS table: every slot up to the last meaningful one (asana /
// colour / breath), padded with blanks to a full row so the grid stays a clean
// rectangle. Colour/breath live in their own row beneath the asanas.
function tableCells(slots: Slot[], slotIds: string[]): TableCell[] {
  let last = -1
  slots.forEach((sl, idx) => {
    if (sl && (sl.asana || sl.color || (sl.segments?.length ?? 0) > 0)) last = idx
  })
  if (last < 0) return []
  const cells: TableCell[] = slots.slice(0, last + 1).map((slot, idx) => ({ slot, id: slotIds[idx] ?? String(idx) }))
  while (cells.length % YWS_COLS !== 0) cells.push({ slot: null, id: `pad-${cells.length}` })
  return cells
}

/** "S-3 D-3 S-3" — same code format as the YWS printout. */
function fmtSegments(segments: Segment[] | undefined): string {
  if (!segments || segments.length === 0) return ''
  return segments.map((s) => `${s.type}-${s.count}`).join(' ')
}

/** Slots that actually hold an asana, paired with their stable id for keys. */
function filledItems(slots: Slot[], slotIds: string[]) {
  return slots
    .map((slot, idx) => ({ slot, id: slotIds[idx] ?? String(idx) }))
    .filter((x): x is { slot: NonNullable<Slot>; id: string } => !!x.slot?.asana)
}

// eslint-disable-next-line max-lines-per-function -- preview shell: header + theme toggle + print-style + view switch cohere as one tree
export function PreviewClient({
  initialProgram,
  shareToken,
  publicView = false,
  backHref = '/dashboard/workouts/builder',
  trackView,
  trackDownload,
}: {
  initialProgram: Program | null
  /** Present on the public /w/<token> page → enables view/download tracking. */
  shareToken?: string
  /** Public share view: hide the back-to-builder link (students aren't teachers). */
  publicView?: boolean
  /** Where the back arrow returns to (Papaya builder vs standalone home). */
  backHref?: string
  /** Optional analytics (Papaya). Standalone passes nothing. */
  trackView?: (token: string) => void
  trackDownload?: (token: string) => void
}) {
  const t = useStrings()
  const tx = t.workoutBuilder.preview
  const program = initialProgram
  const [theme, setTheme] = useState<Theme>('yws')

  // Count one view per load of the public share page (client-side so SSR/prefetch
  // don't inflate it). Guard against double-fire in React strict mode.
  const viewTracked = useRef(false)
  useEffect(() => {
    if (!shareToken || viewTracked.current) return
    viewTracked.current = true
    trackView?.(shareToken)
  }, [shareToken, trackView])

  function onDownload() {
    if (shareToken) trackDownload?.(shareToken)
    window.print()
  }

  // Show the preview when there's any asana OR any description (program / set).
  const hasContent =
    !!program &&
    (!!program.description ||
      (!!program.schedule?.enabled && program.sessions.length > 0) ||
      program.sessions.some((s) => !!s.description || s.slots.some((sl) => sl?.asana)))

  return (
    <div className="min-h-dvh bg-background-subtle">
      {/* Zero @page margin removes the browser's print header/footer (title+date+URL,
          which render in the page margin). Views keep their own print padding. */}
      <style>{`@media print { @page { margin: 0; } }`}</style>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 sm:px-6 h-14 bg-surface/90 backdrop-blur border-b border-border print:hidden">
        {publicView ? (
          <span className="inline-flex items-center gap-1.5 shrink-0 font-mono text-sm font-bold tracking-tight text-primary">YWS Lab</span>
        ) : (
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground-secondary hover:text-foreground po-press shrink-0"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline">{tx.back}</span>
          </Link>
        )}
        <h1 className="min-w-0 flex-1 text-center text-sm font-semibold tracking-tight text-foreground truncate">{program?.title ?? ''}</h1>
        <div className="flex items-center gap-2 shrink-0">
          <ThemeToggle value={theme} onChange={setTheme} />
          {/* Triggers the browser print dialog (→ "Save as PDF"); shown with a
              download icon since that's the typical intent here. */}
          <button
            type="button"
            onClick={onDownload}
            aria-label={tx.download}
            title={tx.download}
            className="inline-flex w-9 h-9 items-center justify-center rounded-md border border-border bg-surface text-foreground-secondary hover:bg-background-subtle hover:text-foreground po-press"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        </div>
      </header>

      {!hasContent || !program ? (
        <p className="text-center text-sm text-foreground-muted py-20">{tx.empty}</p>
      ) : theme === 'yws' ? (
        <YwsView program={program} />
      ) : (
        <PapayaView program={program} />
      )}
    </div>
  )
}

function ThemeToggle({ value, onChange }: { value: Theme; onChange: (t: Theme) => void }) {
  const t = useStrings()
  const tx = t.workoutBuilder.preview
  const opts: { k: Theme; label: string }[] = [
    { k: 'yws', label: tx.themeYws },
    { k: 'papaya', label: tx.themePapaya },
  ]
  return (
    <div role="radiogroup" aria-label={tx.theme} className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-background-subtle border border-border">
      {opts.map((o) => {
        const active = value === o.k
        return (
          <button
            key={o.k}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.k)}
            className={`h-7 px-2.5 sm:px-3 rounded-md text-xs font-semibold po-press whitespace-nowrap ${active ? 'bg-surface text-foreground shadow-sm' : 'text-foreground-secondary hover:text-foreground'}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ─── Schedule grid — read-only mirror of the builder table ──────────── */
function PreviewSchedule({ program, variant }: { program: Program; variant: Theme }) {
  const s = useStrings().workoutBuilder.schedule
  const sch = program.schedule
  if (!sch?.enabled || program.sessions.length === 0) return null
  const days = Array.from({ length: sch.days }, (_, i) => i)
  const yws = variant === 'yws'
  const cellBlank = yws ? 'bg-white border-slate-300' : 'bg-surface border-border-subtle'
  return (
    <section className={`break-inside-avoid space-y-3 ${yws ? '' : 'bg-surface border border-border-subtle rounded-2xl shadow-sm p-5 print:shadow-none'}`}>
      <h2 className={yws ? 'font-mono text-sm font-bold tracking-wide text-slate-900' : 'text-[15px] font-semibold tracking-tight text-foreground'}>
        {s.title}
      </h2>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5">
          <thead>
            <tr>
              <th aria-hidden="true" />
              {days.map((d) => (
                <th key={d} className={`px-0.5 pb-1 text-[11px] font-mono font-semibold text-center ${yws ? 'text-slate-500' : 'text-foreground-muted'}`}>
                  {s.dayPrefix}{d + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {program.sessions.map((sess, i) => {
              const row = sch.cells[sess.id] ?? []
              const label = sess.title.trim() || `${s.setPrefix}${i + 1}`
              return (
                <tr key={sess.id}>
                  <th scope="row" className={`pr-2 text-right align-middle text-[11px] font-mono font-semibold ${yws ? 'text-slate-700' : 'text-foreground-secondary'}`}>
                    <span className="block max-w-[8rem] truncate" title={label}>{label}</span>
                  </th>
                  {days.map((d) => {
                    const color = row[d] ?? null
                    const tint = color ? COLOR_TINT[color] : null
                    return (
                      <td key={d} className="p-0">
                        <div className={`w-8 h-8 rounded-[2px] border ${tint ? `${tint.band} border-transparent` : cellBlank}`} />
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {(sch.rows ?? []).map((r) => {
              const rowCells = sch.cells[r.id] ?? []
              const label = r.label.trim()
              const labelColor = COLOR_TINT[r.color]?.text ?? 'text-emerald-700'
              return (
                <tr key={r.id}>
                  <th scope="row" className={`pr-2 text-right align-middle text-[11px] font-mono font-semibold ${labelColor}`}>
                    <span className="block max-w-[8rem] truncate" title={label}>{label}</span>
                  </th>
                  {days.map((d) => {
                    const color = rowCells[d] ?? null
                    const tint = color ? COLOR_TINT[color] : null
                    return (
                      <td key={d} className="p-0">
                        <div className={`w-8 h-8 rounded-[2px] border ${tint ? `${tint.band} border-transparent` : cellBlank}`} />
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/* ─── YWS Original — bordered table, dense monochrome printout ───────── */
function YwsView({ program }: { program: Program }) {
  return (
    <div
      style={EXACT_PRINT_COLORS}
      className="mx-auto max-w-4xl bg-white text-slate-900 px-6 sm:px-10 py-10 my-0 lg:my-4 lg:rounded-xl lg:shadow-sm space-y-9 print:my-0 print:shadow-none print:rounded-none"
    >
      {(program.title || program.description) && (
        <header className="space-y-2 break-inside-avoid">
          <h1 className="font-mono text-lg font-bold tracking-tight text-slate-900">{program.title}</h1>
          {program.description && (
            <p className="text-sm leading-relaxed text-slate-700 max-w-2xl whitespace-pre-line">{program.description}</p>
          )}
        </header>
      )}
      <PreviewSchedule program={program} variant="yws" />
      {program.sessions.map((s) => {
        const cells = tableCells(s.slots, s.slotIds)
        if (cells.length === 0 && !s.description) return null
        return (
          <section key={s.id} className="space-y-3 break-inside-avoid">
            <h2 className="font-mono text-sm font-bold tracking-wide text-slate-900">{s.title}</h2>
            {s.description && (
              <p className="text-sm leading-relaxed text-slate-700 max-w-2xl whitespace-pre-line">{s.description}</p>
            )}
            {cells.length > 0 && <YwsTable cells={cells} />}
          </section>
        )
      })}
    </div>
  )
}

function YwsTable({ cells }: { cells: TableCell[] }) {
  // 1px grid lines: outer gets left+top, every cell adds right+bottom (no double).
  return (
    <div className="border-l border-t border-slate-300">
      {chunk(cells, YWS_COLS).map((row, ri) => (
        <Fragment key={ri}>
          {/* asanas */}
          <div className="grid grid-cols-6">
            {row.map(({ slot, id }) => (
              <div key={id} className="relative border-r border-b border-slate-300 aspect-[4/3]">
                {slot?.asana && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={slot.asana.src} alt={slot.asana.label} className="absolute inset-0 w-full h-full object-contain p-2 select-none" draggable={false} />
                    {slot.side && (
                      <span className="absolute top-1 right-1.5 font-mono text-[10px] font-bold text-slate-900 leading-none">{slot.side}</span>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
          {/* breath / colour band */}
          <div className="grid grid-cols-6">
            {row.map(({ slot, id }) => {
              const tint = slot?.color ? COLOR_TINT[slot.color] : null
              const code = fmtSegments(slot?.segments)
              return (
                <div
                  key={id}
                  className={`border-r border-b border-slate-300 min-h-[26px] flex items-center justify-center px-1 font-mono text-[11px] leading-none tabular-nums ${tint ? `${tint.band} ${tint.text}` : 'text-slate-700'}`}
                >
                  {code}
                </div>
              )
            })}
          </div>
        </Fragment>
      ))}
    </div>
  )
}

/* ─── Papaya — branded product cards ─────────────────────────────────── */
function PapayaView({ program }: { program: Program }) {
  return (
    <div
      style={EXACT_PRINT_COLORS}
      className="mx-auto max-w-5xl px-4 sm:px-6 py-5 sm:py-6 space-y-4 sm:space-y-5 print:max-w-none print:px-8 print:py-7 print:space-y-3"
    >
      {(program.title || program.description) && (
        <header className="space-y-2">
          <h1 className="text-xl font-bold tracking-tight text-foreground">{program.title}</h1>
          {program.description && (
            <p className="rounded-xl bg-primary-soft text-primary-soft-foreground text-sm leading-relaxed px-4 py-3 whitespace-pre-line max-w-3xl">{program.description}</p>
          )}
        </header>
      )}
      <PreviewSchedule program={program} variant="papaya" />
      {program.sessions.map((s, i) => {
        const items = filledItems(s.slots, s.slotIds)
        if (items.length === 0 && !s.description) return null
        return (
          <section key={s.id} className="bg-surface border border-border-subtle rounded-2xl shadow-sm overflow-hidden break-inside-avoid print:shadow-none">
            <header className="px-5 py-3.5 border-b border-border-subtle flex items-center gap-2.5">
              <span className="inline-flex w-7 h-7 items-center justify-center rounded-full bg-papaya-100 text-papaya-700 text-xs font-bold font-mono shrink-0">{i + 1}</span>
              <h2 className="min-w-0 text-[15px] font-semibold tracking-tight text-foreground truncate">{s.title}</h2>
            </header>
            {s.description && (
              <div className="px-5 pt-4">
                <p className="rounded-xl bg-primary-soft text-primary-soft-foreground text-sm leading-relaxed px-4 py-3 whitespace-pre-line">{s.description}</p>
              </div>
            )}
            {/* print: A4 (~794px) falls in the `sm` range, so without an explicit
                print column count the grid collapsed to 3 — force 6 (matches the
                screen large view + the YWS table). */}
            {items.length > 0 && (
              <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 print:grid-cols-6 gap-3 sm:gap-4 print:gap-2 print:p-3">
                {items.map(({ slot, id }) => (
                  <PapayaCell key={id} slot={slot} />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function PapayaCell({ slot }: { slot: NonNullable<Slot> }) {
  const asana = slot.asana!
  const segments = slot.segments ?? []
  const tint = slot.color ? COLOR_TINT[slot.color] : null
  // Full-width colour bar at the bottom of the card (mirrors YWS + the builder's
  // slot footer), carrying the breath codes. Shown when there's colour or breath.
  const showBar = segments.length > 0 || !!tint
  return (
    <div className="rounded-xl border border-border-subtle bg-surface overflow-hidden">
      <div className="relative aspect-square bg-background-subtle">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asana.src} alt={asana.label} className="absolute inset-0 w-full h-full object-contain p-3 select-none" draggable={false} />
        {slot.side && (
          <span className="absolute top-1.5 left-1.5 inline-flex w-5 h-5 items-center justify-center rounded-md bg-surface ring-1 ring-border text-[10px] font-bold font-mono text-foreground-secondary">{slot.side}</span>
        )}
      </div>
      {showBar && (
        <div className={`flex items-center justify-center gap-2 px-2 py-1.5 min-h-[28px] border-t font-mono text-[11px] leading-none tabular-nums ${tint ? `${tint.band} ${tint.text} border-transparent` : 'border-border-subtle text-foreground-secondary'}`}>
          {segments.map((seg, j) => (
            <span key={j} className="inline-flex items-center gap-1">
              <SegShape type={seg.type} />
              {seg.count}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function SegShape({ type }: { type: SegmentType }) {
  // Square = static (S), triangle = dynamic (D) — same language as the builder.
  if (type === 'S') return <span aria-hidden="true" className="inline-block w-2 h-2 bg-current opacity-80" />
  return (
    <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true">
      <polygon points="6,1 11,11 1,11" fill="currentColor" />
    </svg>
  )
}
