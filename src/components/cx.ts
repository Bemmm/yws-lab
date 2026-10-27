export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export type Dynamics = "pending" | "steady" | "rapid" | "stagnation" | "attention";
export type CompetencyGroup = "basic" | "system";
