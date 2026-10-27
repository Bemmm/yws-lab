export type CompetencyGroup = "basic" | "system";

/** The 16 fixed competencies in spec order (specs/03-student-progress.md section 4). Codes are stable DB keys. */
export const COMPETENCIES = [
  { code: "speech_voice", group: "basic" },
  { code: "relay_function", group: "basic" },
  { code: "confidence", group: "basic" },
  { code: "audience_contact", group: "basic" },
  { code: "physical_preparation", group: "basic" },
  { code: "coordination", group: "basic" },
  { code: "demonstration_ability", group: "basic" },
  { code: "sense_of_rhythm", group: "basic" },
  { code: "movement_plasticity", group: "basic" },
  { code: "mode_command", group: "system" },
  { code: "command_timing", group: "system" },
  { code: "command_quality", group: "system" },
  { code: "group_attention", group: "system" },
  { code: "exercise_purpose", group: "system" },
  { code: "transitions", group: "system" },
  { code: "system_principles", group: "system" },
] as const;

export type CompetencyCode = (typeof COMPETENCIES)[number]["code"];

export const COMPETENCY_CODES: readonly CompetencyCode[] = COMPETENCIES.map((c) => c.code);

export function isCompetencyCode(value: unknown): value is CompetencyCode {
  return typeof value === "string" && (COMPETENCY_CODES as readonly string[]).includes(value);
}
