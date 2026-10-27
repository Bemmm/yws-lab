'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { WorkoutProgram } from '@posemio/contracts'
import { auth } from '@/auth'
import {
  createWorkoutProgram,
  saveWorkoutProgram,
  deleteWorkoutProgram,
  enableWorkoutSharing,
  disableWorkoutSharing,
  getAssignContext,
  assignProgram,
  unassignProgram,
  type SaveProgramResult,
  type ShareResult,
  type AssignableStudent,
} from '@/services/workout/public'

// WKB wiring — server bridge между билдером/архивом тренировок и workout-сервисом.
// Чтение списка/программы server-компоненты делают сервисом напрямую (см. page.tsx);
// здесь — мутации (create/save/delete), вызываемые из client (autosave) и форм.

/**
 * Создать пустую программу и сразу открыть её в билдере (T5 «новая тренировка»).
 * Принимает опциональный FormData — чтобы вызываться как `<form action={…}>`.
 */
export async function createProgramAction(_formData?: FormData): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const { id } = await createWorkoutProgram(session!.user.id)
  redirect(`/dashboard/workouts/builder?id=${id}`)
}

/** Удалить программу из архива (T5). */
export async function deleteProgramAction(programId: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) return
  await deleteWorkoutProgram(session.user.id, programId)
  revalidatePath('/dashboard/workouts')
}

/** Autosave из билдера (debounced). Full-replace всей программы (§8.2). */
export async function saveProgramAction(
  program: WorkoutProgram,
): Promise<SaveProgramResult | { status: 'unauthorized' }> {
  const session = await auth()
  if (!session?.user?.id) return { status: 'unauthorized' }
  return saveWorkoutProgram(session.user.id, program)
}

/** Включить публичный шеринг → вернуть share_token (идемпотентно). */
export async function enableSharingAction(
  programId: string,
): Promise<ShareResult | { status: 'unauthorized' }> {
  const session = await auth()
  if (!session?.user?.id) return { status: 'unauthorized' }
  return enableWorkoutSharing(session.user.id, programId)
}

/** Отключить шеринг (revoke — старая ссылка перестаёт работать). */
export async function disableSharingAction(
  programId: string,
): Promise<ShareResult | { status: 'unauthorized' }> {
  const session = await auth()
  if (!session?.user?.id) return { status: 'unauthorized' }
  return disableWorkoutSharing(session.user.id, programId)
}

// ─── S5 — назначение программы ученикам (assignment-модель) ──────────────────

/** Контекст для модалки «Назначить ученикам»: ростер-ученики + assigned-флаг. */
export async function getAssignContextAction(
  programId: string,
): Promise<{ status: 'ok'; students: AssignableStudent[] } | { status: 'unauthorized' } | { status: 'not_found' }> {
  const session = await auth()
  if (!session?.user?.id) return { status: 'unauthorized' }
  const students = await getAssignContext(session.user.id, programId)
  if (students === null) return { status: 'not_found' }
  return { status: 'ok', students }
}

/** Назначить/снять назначение программы конкретному ученику (toggle из модалки). */
export async function setAssignmentAction(
  programId: string,
  studentUserId: string,
  assigned: boolean,
): Promise<{ ok: boolean }> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false }
  const res = assigned
    ? await assignProgram(session.user.id, programId, studentUserId)
    : await unassignProgram(session.user.id, programId, studentUserId)
  return { ok: res.status === 'ok' }
}
