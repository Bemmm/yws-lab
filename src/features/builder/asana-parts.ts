/** Tiny helpers kept apart from the 120 kB manifest so pages that only need alt text don't ship the catalog. */

export type AsanaLevel = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'Other'

/** Level and frame number parsed from the id, for localized alt text. */
export function asanaParts(id: string): { level: AsanaLevel; frame: string } {
  const m = /^(L[1-6]|Other)\/frame-(\d+)\.svg$/.exec(id)
  return { level: (m?.[1] as AsanaLevel | undefined) ?? 'Other', frame: m?.[2] ?? '' }
}
