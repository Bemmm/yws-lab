import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import {
  getWorkoutProgram,
  listWorkoutPrograms,
  createWorkoutProgram,
} from '@/services/workout/public'
import { PapayaBuilder } from './papaya-builder'

/**
 * Workout-builder (T4). Spec: 15-workout-builder.md · 01-site-structure.md §7.2.
 * BE-wired (WKB): программа грузится из workout_programs (JSONB-документ) по `?id`,
 * автосейв через saveProgramAction. Без `id` — открываем последнюю программу
 * teacher'а либо создаём первую. Drag-and-drop конструктор (1,235 SVG, 6 уровней).
 *
 * Без PageShell: страница — серый canvas с двумя карточками (конструктор + библиотека);
 * весь лэйаут — в BuilderClient.
 */

export default async function BuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id
  const { id } = await searchParams

  if (id) {
    const res = await getWorkoutProgram(userId, id)
    // Чужая/удалённая/битая программа → назад в архив (без молчаливого создания).
    if (res.status !== 'ok') redirect('/dashboard/workouts')
    return <PapayaBuilder initialProgram={res.program} initialShareToken={res.shareToken} />
  }

  // Без id — каноникализируем URL: открыть последнюю программу или создать первую.
  const list = await listWorkoutPrograms(userId)
  if (list.length > 0) redirect(`/dashboard/workouts/builder?id=${list[0]!.id}`)
  const created = await createWorkoutProgram(userId)
  redirect(`/dashboard/workouts/builder?id=${created.id}`)
}
