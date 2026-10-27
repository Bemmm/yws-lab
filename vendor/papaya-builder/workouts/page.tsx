import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { listWorkoutPrograms } from '@/services/workout/public'
import { WorkoutsListClient } from './workouts-list-client'

/**
 * Архив тренировок (T5). Spec: 15-workout-builder.md §8 · 01-site-structure.md §7.2.
 * BE-wired (WKB): реальный список программ teacher'а из workout_programs (метаданные
 * считаются server-side из JSONB). Создание/удаление — server-actions (_actions.ts).
 */
export const metadata = {
  title: 'Тренировки · Papaya',
}

export default async function WorkoutsArchivePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const programs = await listWorkoutPrograms(session.user.id)
  return <WorkoutsListClient programs={programs} />
}
