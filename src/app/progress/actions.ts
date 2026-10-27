"use server";

/**
 * Server actions of the progress area. Every action calls requireMethodologist() FIRST
 * (non-methodologists get notFound(), same as a missing page); inputs are validated by the service's zod schemas.
 * Never log arguments or results: they contain names and scores.
 */
import { requireMethodologist } from "@/server/auth/session";
import * as svc from "@/server/progress/service";
import type { StartingProfile } from "@/server/progress/service";

export async function createCohortAction(input: { name: string; startDate?: string | null; endDate?: string | null }) {
  const me = await requireMethodologist();
  return svc.createCohort(
    { name: input.name, startDate: input.startDate || null, endDate: input.endDate || null },
    me.id,
  );
}

export async function setModulesAction(cohortId: string, modules: number[], expectedVersion: number) {
  const me = await requireMethodologist();
  return svc.setModules(cohortId, modules, expectedVersion, me.id);
}

export async function searchStudentsAction(query: string) {
  await requireMethodologist();
  return svc.searchStudents({ query, limit: 20 });
}

export async function enrollAction(input: {
  cohortId: string;
  student: { studentId: string } | { newStudent: { displayName: string; contact?: string | null; note?: string | null } };
  startingProfile: StartingProfile;
}) {
  const me = await requireMethodologist();
  return svc.enroll(input, me.id);
}

export async function setStartingProfileAction(enrollmentId: string, startingProfile: StartingProfile) {
  const me = await requireMethodologist();
  return svc.setStartingProfile(enrollmentId, startingProfile, me.id);
}

export async function archiveEnrollmentAction(enrollmentId: string) {
  const me = await requireMethodologist();
  return svc.archiveEnrollment(enrollmentId, me.id);
}

export async function restoreEnrollmentAction(enrollmentId: string) {
  const me = await requireMethodologist();
  return svc.restoreEnrollment(enrollmentId, me.id);
}

/** Cohort overview: cards alphabetical, summary over the whole active cohort. */
export async function getOverviewAction(
  cohortId: string,
  filters?: { startingProfile?: StartingProfile; dynamics?: svc.DynamicsLabel },
) {
  await requireMethodologist();
  return svc.getCohortOverview(cohortId, filters);
}

export async function getStageFormAction(enrollmentId: string, stage: string) {
  await requireMethodologist();
  return svc.getStageForm(enrollmentId, stage);
}

export async function saveStageAction(
  enrollmentId: string,
  stage: string,
  scores: Record<string, number | null>,
  expectedVersion: number,
) {
  const me = await requireMethodologist();
  return svc.saveStage(enrollmentId, stage, scores, expectedVersion, me.id);
}
