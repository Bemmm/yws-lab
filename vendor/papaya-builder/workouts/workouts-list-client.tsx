'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useT } from '../../_lib/app-i18n'
import { WorkoutsIcon } from '../../_components/page-icons'
import { EmptyState, PageShell } from '../_lib/page-shell'
import { createProgramAction, deleteProgramAction } from './_actions'
import { AssignModal } from './assign-modal'
import type { WorkoutProgramSummary } from '@/services/workout/public'

// T5 — архив тренировок (BE-wired). Карточная сетка: превью первых асан (real SVG
// из JSONB), метаданные, счётчики share-активности (👁/⬇), статус публичной ссылки.
// Карточка целиком открывает билдер (stretched-link); удаление — hover-кнопка.

// Детерминированный DD.MM.YYYY — без toLocaleDateString (SSR/CSR hydration-safe).
function fmtDate(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`
}

const BTN_PRIMARY =
  'inline-flex items-center h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:bg-primary-hover po-press'

function EyeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function DownloadMiniIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

export function WorkoutsListClient({ programs }: { programs: WorkoutProgramSummary[] }) {
  const t = useT()
  const w = t.dashboard.workouts
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [assignTarget, setAssignTarget] = useState<{ id: string; title: string } | null>(null)

  function onDelete(id: string, title: string) {
    // i18n строк подтверждения/удаления — follow-up (пока RU, §artifact-lang).
    if (!window.confirm(`Удалить «${title}»? Действие необратимо.`)) return
    startTransition(async () => {
      await deleteProgramAction(id)
      router.refresh()
    })
  }

  return (
    <PageShell
      icon={<WorkoutsIcon />}
      title={w.title}
      description={w.description}
      action={
        <form action={createProgramAction}>
          <button type="submit" className={BTN_PRIMARY}>
            {w.openBuilder}
          </button>
        </form>
      }
    >
      {programs.length === 0 ? (
        <EmptyState
          title={w.emptyTitle}
          body={w.emptyBody}
          cta={
            <form action={createProgramAction}>
              <button type="submit" className="inline-flex items-center h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:bg-primary-hover po-press">
                {w.openBuilderCta}
              </button>
            </form>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {programs.map((row) => (
            <ProgramCard
              key={row.id}
              row={row}
              pending={pending}
              onDelete={onDelete}
              onAssign={() => setAssignTarget({ id: row.id, title: row.title })}
            />
          ))}
        </div>
      )}
      {assignTarget && (
        <AssignModal
          programId={assignTarget.id}
          programTitle={assignTarget.title}
          onClose={() => setAssignTarget(null)}
        />
      )}
    </PageShell>
  )
}

// Полоса превью: первые 4 асаны программы; недостающие ячейки — пустые слоты
// (dashed-плейсхолдер), чтобы полоса всегда держала высоту и ритм сетки.
function PreviewStrip({ srcs, title }: { srcs: string[]; title: string }) {
  const cells = Array.from({ length: 4 }, (_, i) => srcs[i] ?? null)
  return (
    <div className="grid grid-cols-4 gap-px bg-border-subtle border-b border-border-subtle">
      {cells.map((src, i) =>
        src ? (
          <div key={i} className="aspect-square bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element -- локальные SVG-асаны, оптимизация не нужна */}
            <img src={src} alt={i === 0 ? title : ''} className="w-full h-full object-contain p-2 select-none" draggable={false} />
          </div>
        ) : (
          <div key={i} className="aspect-square bg-background-subtle flex items-center justify-center">
            <span className="w-5 h-5 rounded-md border-2 border-dashed border-border" aria-hidden="true" />
          </div>
        ),
      )}
    </div>
  )
}

function ProgramCard({
  row,
  pending,
  onDelete,
  onAssign,
}: {
  row: WorkoutProgramSummary
  pending: boolean
  onDelete: (id: string, title: string) => void
  onAssign: () => void
}) {
  const t = useT()
  const w = t.dashboard.workouts
  return (
    <article className="group relative flex flex-col rounded-2xl border border-border bg-surface shadow-sm overflow-hidden transition hover:shadow-md hover:border-primary/40 focus-within:ring-2 focus-within:ring-ring">
      <PreviewStrip srcs={row.previewSrcs} title={row.title} />
      <div className="flex-1 flex flex-col gap-2 p-4">
        <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
          {/* stretched link — вся карточка открывает билдер */}
          <Link href={`/dashboard/workouts/builder?id=${row.id}`} className="focus:outline-none after:absolute after:inset-0">
            {row.title}
          </Link>
        </h3>
        <p className="font-mono text-[11px] text-foreground-muted tabular-nums">
          {row.sessionsCount} сет. · {row.filledSlotsCount}/{row.slotsCount} {w.asanasSuffix}
        </p>
        <div className="mt-auto pt-2 border-t border-border-subtle flex items-center gap-3 font-mono text-[11px] text-foreground-muted tabular-nums">
          <span className="inline-flex items-center gap-1" title="Просмотры по ссылке">
            <EyeIcon /> {row.viewsCount}
          </span>
          <span className="inline-flex items-center gap-1" title="Скачивания по ссылке">
            <DownloadMiniIcon /> {row.downloadsCount}
          </span>
          {row.shareToken && (
            <span className="inline-flex items-center gap-1 text-emerald-600" title="Публичная ссылка активна">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" /> доступ
            </span>
          )}
          <span className="ml-auto">{fmtDate(row.updatedAt)}</span>
        </div>
      </div>
      {/* hover-действия — поверх stretched-link (z-10): назначить + удалить */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={onAssign}
          aria-label={w.assign.action}
          title={w.assign.action}
          className="inline-flex w-7 h-7 items-center justify-center rounded-md bg-surface/90 backdrop-blur border border-border text-foreground-muted hover:text-primary hover:border-primary/40 hover:bg-primary/5 po-press"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
          </svg>
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => onDelete(row.id, row.title)}
          aria-label={`Удалить «${row.title}»`}
          title="Удалить"
          className="inline-flex w-7 h-7 items-center justify-center rounded-md bg-surface/90 backdrop-blur border border-border text-foreground-muted hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 po-press disabled:opacity-50"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </article>
  )
}
