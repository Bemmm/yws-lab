'use client'

import { useT } from '../../../_lib/app-i18n'
import { WorkoutsIcon } from '../../../_components/page-icons'
import type { WorkoutProgram } from '@posemio/contracts'
import { BuilderClient } from './builder-client'
import { BuilderStringsProvider, type BuilderStrings } from './_lib/strings'
import type { Program } from './_lib/use-program'
import { saveProgramAction, enableSharingAction, disableSharingAction } from '../_actions'

/**
 * Papaya wiring for the (decoupled) builder core: injects the cabinet's i18n,
 * BE autosave, public-share actions, and breadcrumb identity. The same
 * BuilderClient is bundled standalone in apps/builder with localStorage wiring.
 */
export function PapayaBuilder({
  initialProgram,
  initialShareToken,
}: {
  initialProgram: WorkoutProgram
  initialShareToken: string | null
}) {
  const t = useT()
  const strings = {
    workoutBuilder: t.workoutBuilder,
    sidebar: { teacher: { workouts: t.sidebar.teacher.workouts } },
  } as BuilderStrings
  return (
    <BuilderStringsProvider value={strings}>
      <BuilderClient
        initialProgram={initialProgram as unknown as Program}
        save={(p) => saveProgramAction(p as unknown as WorkoutProgram)}
        share={{
          initialToken: initialShareToken,
          enable: enableSharingAction,
          disable: disableSharingAction,
        }}
        previewHref={(id) => (id ? `/workout-preview?id=${id}` : '/workout-preview')}
        brand={{ href: '/dashboard/workouts', label: t.sidebar.teacher.workouts, icon: <WorkoutsIcon /> }}
      />
    </BuilderStringsProvider>
  )
}
