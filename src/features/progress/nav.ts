/** Pure URL / query helpers shared by the progress pages. */
import { orderStages, type StageId } from "@/server/progress/calc";
import type { DynamicsLabel } from "@/server/progress/calc";

export const PROFILES = ["polishing", "reframing", "from_zero"] as const;
export type Profile = (typeof PROFILES)[number];
export const DYNAMICS_FILTERS: readonly DynamicsLabel[] = [
  "point0_incomplete",
  "only_point0",
  "attention",
  "stagnation",
  "steady",
  "rapid",
];

export interface CohortFilters {
  profile?: Profile;
  dynamics?: DynamicsLabel;
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Read and validate filters from search params; unknown values are dropped. */
export function parseFilters(sp: Record<string, string | string[] | undefined>): CohortFilters {
  const profile = first(sp.profile);
  const dynamics = first(sp.dynamics);
  return {
    profile: (PROFILES as readonly string[]).includes(profile ?? "") ? (profile as Profile) : undefined,
    dynamics: (DYNAMICS_FILTERS as readonly string[]).includes(dynamics ?? "") ? (dynamics as DynamicsLabel) : undefined,
  };
}

/** "?profile=…&dynamics=…" or "" */
export function filtersQuery(f: CohortFilters): string {
  const p = new URLSearchParams();
  if (f.profile) p.set("profile", f.profile);
  if (f.dynamics) p.set("dynamics", f.dynamics);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const cohortHref = (cohortId: string, f: CohortFilters = {}) => `/progress/cohorts/${cohortId}${filtersQuery(f)}`;
export const studentHref = (cohortId: string, enrollmentId: string, f: CohortFilters = {}) =>
  `/progress/cohorts/${cohortId}/students/${enrollmentId}${filtersQuery(f)}`;
export const assessHref = (cohortId: string, enrollmentId: string, stage: StageId, f: CohortFilters = {}) =>
  `/progress/cohorts/${cohortId}/students/${enrollmentId}/assess/${stage}${filtersQuery(f)}`;

/**
 * Stage the "Assess" action should open: the latest stage that has scores while it is still partial,
 * otherwise the next configured stage after a complete one (it is unlocked because the prior has scores).
 */
export function nextAssessStage(
  modules: readonly number[],
  currentStage: StageId | null,
  currentStageScored: number,
  total = 16,
): StageId {
  const ordered = orderStages(modules);
  if (!currentStage) return ordered[0]!;
  if (currentStageScored < total) return currentStage;
  const i = ordered.indexOf(currentStage);
  return ordered[i + 1] ?? currentStage;
}
