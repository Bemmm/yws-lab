"use server";

/**
 * Server actions of the progress area. Every action calls requireMethodologist() FIRST
 * (non-methodologists get notFound(), same as a missing page); inputs are validated by the service's zod schemas.
 * Never log arguments or results: they contain names and scores.
 */
import { notFound } from "next/navigation";
import { requireMethodologist } from "@/server/auth/session";
import * as svc from "@/server/progress/service";
import type { StartingProfile } from "@/server/progress/service";

/** The enrollment must belong to the given cohort, else 404 (non-disclosing). */
async function assertInCohort(cohortId: string, enrollmentId: string) {
  if ((await svc.enrollmentCohortId(enrollmentId)) !== cohortId) notFound();
}

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

export async function setStartingProfileAction(cohortId: string, enrollmentId: string, startingProfile: StartingProfile) {
  const me = await requireMethodologist();
  await assertInCohort(cohortId, enrollmentId);
  return svc.setStartingProfile(enrollmentId, startingProfile, me.id);
}

export async function archiveEnrollmentAction(cohortId: string, enrollmentId: string) {
  const me = await requireMethodologist();
  await assertInCohort(cohortId, enrollmentId);
  return svc.archiveEnrollment(enrollmentId, me.id);
}

export async function restoreEnrollmentAction(cohortId: string, enrollmentId: string) {
  const me = await requireMethodologist();
  await assertInCohort(cohortId, enrollmentId);
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

export async function getStageFormAction(cohortId: string, enrollmentId: string, stage: string) {
  await requireMethodologist();
  await assertInCohort(cohortId, enrollmentId);
  return svc.getStageForm(enrollmentId, stage);
}

export async function saveStageAction(
  cohortId: string,
  enrollmentId: string,
  stage: string,
  scores: Record<string, number | null>,
  expectedVersion: number,
) {
  const me = await requireMethodologist();
  await assertInCohort(cohortId, enrollmentId);
  return svc.saveStage(enrollmentId, stage, scores, expectedVersion, me.id);
}
