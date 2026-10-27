import { requireFeature } from '@/services/_shared/feature-flags/public'

// ADM — feature flag gate for the whole «Тренировки» section (incl. /builder).
export default async function WorkoutsGateLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('workout_builder')
  return <>{children}</>
}
