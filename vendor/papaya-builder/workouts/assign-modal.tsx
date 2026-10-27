'use client'

import { useEffect, useState } from 'react'
import { useT } from '../../_lib/app-i18n'
import { getAssignContextAction, setAssignmentAction } from './_actions'
import type { AssignableStudent } from '@/services/workout/public'

// S5 — модалка «Назначить ученикам». Грузит ростер-контекст (account-ученики +
// assigned-флаг) и переключает назначение per-ученик (оптимистично, откат на ошибке).
// Стейт назначения живёт в БД (workout_assignments), модалка — тонкий тогглер.
// eslint-disable-next-line max-lines-per-function -- модалка: загрузка контекста + список-тоггл + футер цельны
export function AssignModal({
  programId,
  programTitle,
  onClose,
}: {
  programId: string
  programTitle: string
  onClose: () => void
}) {
  const t = useT()
  const a = t.dashboard.workouts.assign
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading')
  const [students, setStudents] = useState<AssignableStudent[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getAssignContextAction(programId)
      .then((res) => {
        if (!alive) return
        if (res.status === 'ok') {
          setStudents(res.students)
          setState('ready')
        } else {
          setState('error')
        }
      })
      .catch(() => alive && setState('error'))
    return () => {
      alive = false
    }
  }, [programId])

  async function toggle(studentId: string, next: boolean) {
    if (busyId) return
    setBusyId(studentId)
    // optimistic flip
    setStudents((prev) => prev.map((s) => (s.studentId === studentId ? { ...s, assigned: next } : s)))
    const res = await setAssignmentAction(programId, studentId, next)
    if (!res.ok) {
      // revert
      setStudents((prev) => prev.map((s) => (s.studentId === studentId ? { ...s, assigned: !next } : s)))
    }
    setBusyId(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-surface border border-border shadow-lg flex flex-col max-h-[80vh]">
        <header className="px-6 pt-6 pb-3">
          <h3 className="text-base font-bold text-foreground">{a.title}</h3>
          <p className="mt-1 text-sm text-foreground-muted truncate">{programTitle}</p>
          <p className="mt-2 text-sm text-foreground-secondary">{a.subtitle}</p>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
          {state === 'loading' && <p className="px-3 py-6 text-center text-sm text-foreground-muted">{a.loading}</p>}
          {state === 'error' && <p className="px-3 py-6 text-center text-sm text-rose-600">{a.error}</p>}
          {state === 'ready' && students.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-foreground-muted">{a.empty}</p>
          )}
          {state === 'ready' &&
            students.map((s) => (
              <label
                key={s.studentId}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-background-subtle"
              >
                <input
                  type="checkbox"
                  checked={s.assigned}
                  disabled={busyId === s.studentId}
                  onChange={(e) => void toggle(s.studentId, e.target.checked)}
                  className="w-4 h-4 rounded border-border-strong accent-primary"
                />
                <span className="text-sm text-foreground truncate">{s.name}</span>
              </label>
            ))}
        </div>

        <footer className="px-6 py-4 border-t border-border-subtle flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-5 rounded-xl bg-gradient-cta text-white text-sm font-semibold po-press"
          >
            {a.done}
          </button>
        </footer>
      </div>
    </div>
  )
}
