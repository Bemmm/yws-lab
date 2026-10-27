import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getWorkoutProgram, listWorkoutPrograms } from '@/services/workout/public'
import { PapayaPreview } from './papaya-preview'

/**
 * Превью созданной программы (T4 — экспериментальная фича).
 *
 * Standalone-страница ВНЕ кабинетного shell'а (без сайдбара/топбара) — открывается
 * в новой вкладке из конструктора. BE-wired (WKB): грузит ту же программу из
 * workout_programs по `?id` (без id — последнюю по updated_at) и показывает её в
 * двух темах (YWS Original / Papaya). Auth-гейт свой (dashboard-layout не оборачивает).
 */
export const metadata = {
  title: 'Превью программы · Papaya',
}

export default async function WorkoutPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id
  const { id } = await searchParams

  const programId = id ?? (await listWorkoutPrograms(userId))[0]?.id
  const res = programId ? await getWorkoutProgram(userId, programId) : null
  const program = res?.status === 'ok' ? res.program : null

  return <PapayaPreview initialProgram={program} />
}
