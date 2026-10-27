'use client'

import { useT } from '../_lib/app-i18n'
import type { WorkoutProgram } from '@posemio/contracts'
import { PreviewClient } from './preview-client'
import { BuilderStringsProvider, type BuilderStrings } from '../dashboard/workouts/builder/_lib/strings'
import type { Program } from '../dashboard/workouts/builder/_lib/use-program'
import { trackShareViewAction, trackShareDownloadAction } from './_actions'

/**
 * Papaya wiring for the (decoupled) preview core: cabinet i18n + share-analytics.
 * Used by the in-cabinet preview (no token) and the public /w/<token> share page.
 */
export function PapayaPreview({
  initialProgram,
  shareToken,
  publicView,
  backHref,
}: {
  initialProgram: WorkoutProgram | null
  shareToken?: string
  publicView?: boolean
  /** Куда ведёт стрелка «назад» (по умолчанию — конструктор teacher'а). Student-
   * playback (S5) передаёт '/student/workouts'. */
  backHref?: string
}) {
  const t = useT()
  const strings = {
    workoutBuilder: t.workoutBuilder,
    sidebar: { teacher: { workouts: t.sidebar.teacher.workouts } },
  } as BuilderStrings
  return (
    <BuilderStringsProvider value={strings}>
      <PreviewClient
        initialProgram={initialProgram as unknown as Program | null}
        shareToken={shareToken}
        publicView={publicView}
        backHref={backHref}
        trackView={trackShareViewAction}
        trackDownload={trackShareDownloadAction}
      />
    </BuilderStringsProvider>
  )
}
