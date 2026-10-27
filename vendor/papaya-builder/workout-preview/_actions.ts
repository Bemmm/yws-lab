'use server'

import { incrementWorkoutView, incrementWorkoutDownload } from '@/services/workout/public'

// WKB share analytics (§9) — ПУБЛИЧНЫЕ трекинг-экшены (без auth): вызываются из
// PreviewClient на публичной странице /w/<token>. Скоуп строго по share_token —
// инкрементят счётчики только расшаренной программы. Best-effort (ошибку глотаем,
// просмотр/скачивание ученику не должны падать из-за аналитики).

export async function trackShareViewAction(shareToken: string): Promise<void> {
  try {
    await incrementWorkoutView(shareToken)
  } catch {
    // analytics best-effort — не рушим публичный просмотр
  }
}

export async function trackShareDownloadAction(shareToken: string): Promise<void> {
  try {
    await incrementWorkoutDownload(shareToken)
  } catch {
    // analytics best-effort
  }
}
