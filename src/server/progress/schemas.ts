/** zod schemas for every input of the progress service (specs/03-student-progress.md sections 2-5, 9). */
import { z } from "zod";
import { isCompetencyCode, type CompetencyCode } from "./competencies";
import { isValidStageId } from "./calc";

const uuid = z.uuid();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const startingProfileSchema = z.enum(["polishing", "reframing", "from_zero"]);
export const cohortStatusSchema = z.enum(["active", "archived"]);
export const stageSchema = z.string().refine(isValidStageId, "invalid stage");
export const moduleNumbersSchema = z
  .array(z.number().int().min(1).max(12))
  .max(12)
  .refine((a) => new Set(a).size === a.length, "module numbers must be distinct");

export const createCohortSchema = z.object({
  name: z.string().trim().min(1).max(80),
  startDate: dateOnly.nullable().optional(),
  endDate: dateOnly.nullable().optional(),
  modules: moduleNumbersSchema.optional(),
});

export const updateCohortSchema = z.object({
  cohortId: uuid,
  name: z.string().trim().min(1).max(80).optional(),
  startDate: dateOnly.nullable().optional(),
  endDate: dateOnly.nullable().optional(),
});

export const listCohortsSchema = z.object({ status: cohortStatusSchema.optional() }).optional();

export const setModulesSchema = z.object({
  cohortId: uuid,
  modules: moduleNumbersSchema,
  expectedVersion: z.number().int().min(1),
});

export const studentFieldsSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  contact: optionalText(200),
  note: optionalText(2000),
});

export const updateStudentSchema = z.object({
  studentId: uuid,
  displayName: z.string().trim().min(1).max(120).optional(),
  contact: optionalText(200),
  note: optionalText(2000),
});

export const searchStudentsSchema = z.object({
  query: z.string().trim().max(120).optional(),
  includeArchived: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export const enrollSchema = z.object({
  cohortId: uuid,
  student: z.union([z.object({ studentId: uuid }), z.object({ newStudent: studentFieldsSchema })]),
  startingProfile: startingProfileSchema,
});

export const setStartingProfileSchema = z.object({ enrollmentId: uuid, startingProfile: startingProfileSchema });

/** Raw scores payload; range / unknown-code checks live in `validateScores` so they get distinct typed errors. */
export const scoresInputSchema = z.record(z.string(), z.number().nullable());

export const saveStageSchema = z.object({
  enrollmentId: uuid,
  stage: stageSchema,
  scores: scoresInputSchema,
  expectedVersion: z.number().int().min(0),
  actorId: uuid,
});

export const overviewFiltersSchema = z
  .object({
    startingProfile: startingProfileSchema.optional(),
    dynamics: z.enum(["point0_incomplete", "only_point0", "attention", "stagnation", "steady", "rapid"]).optional(),
  })
  .optional();

export type ScoreIssue =
  | { code: "unknown_competency"; competency: string }
  | { code: "invalid_score"; competency: CompetencyCode; value: number };

/** Integer 0-10 or null, only known competency codes. Returns the issues (empty = valid). */
export function validateScores(scores: Record<string, number | null>): ScoreIssue[] {
  const issues: ScoreIssue[] = [];
  for (const [key, value] of Object.entries(scores)) {
    if (!isCompetencyCode(key)) {
      issues.push({ code: "unknown_competency", competency: key });
    } else if (value !== null && !(Number.isInteger(value) && value >= 0 && value <= 10)) {
      issues.push({ code: "invalid_score", competency: key, value });
    }
  }
  return issues;
}
