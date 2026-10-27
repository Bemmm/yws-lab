/** Display helpers for the progress UI. Pure; none of these feed a calculation. */
import type { Dictionary } from "@/i18n/dictionaries";
import {
  formatSignedInt,
  formatSignedOneDecimal,
  moduleNumberOf,
  roundOneDecimal,
  type Dynamics,
  type DynamicsLabel,
  type StageId,
} from "@/server/progress/calc";
import type { CompetencyCode } from "@/server/progress/competencies";
import type { ProgressError } from "@/server/progress/service";

export type PT = Dictionary["progress"];

/** "Hello {name}" + {name: "x"} -> "Hello x". Missing keys stay as written. */
export function fmt(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Decimal separator follows the interface locale (uk / ru use a comma). */
export function localizeDecimal(text: string, locale: string): string {
  return locale === "uk" || locale === "ru" ? text.replace(".", ",") : text;
}

/** One-decimal level for display, "—" when missing. */
export function formatLevel(value: number | null, locale: string, dash = "—"): string {
  if (value === null) return dash;
  return localizeDecimal(roundOneDecimal(value).toFixed(1), locale);
}

/** "+1,5" / "0" / "−0,3" */
export function formatGain(value: number, locale: string): string {
  return localizeDecimal(formatSignedOneDecimal(value), locale);
}

export const formatDelta = formatSignedInt;

export function stageLabel(t: PT, stage: StageId): string {
  const n = moduleNumberOf(stage);
  if (n !== null) return fmt(t.stage.module, { n });
  if (stage === "point0") return t.stage.point0;
  if (stage === "final") return t.stage.final;
  return stage;
}

/** DynamicsPill status for a dynamics label. */
export function pillStatus(label: DynamicsLabel): "pending" | "steady" | "rapid" | "stagnation" | "attention" {
  return label === "point0_incomplete" || label === "only_point0" ? "pending" : label;
}

/** Short reason text for an Attention label, or null. */
export function attentionReason(t: PT, d: Dynamics, locale: string): string | null {
  if (!d.reason) return null;
  const from = d.from ? stageLabel(t, d.from) : "";
  const to = d.to ? stageLabel(t, d.to) : "";
  if (d.reason.kind === "level_fall") {
    return fmt(t.dynamics.reasonLevelFall, { delta: formatGain(d.reason.delta, locale), from, to });
  }
  const main = fmt(t.dynamics.reasonCompetencyFall, {
    label: t.competency[d.reason.code as CompetencyCode],
    fall: d.reason.fall,
    from,
    to,
  });
  return d.reason.others > 0 ? `${main}; ${fmt(t.dynamics.reasonOthers, { n: d.reason.others })}` : main;
}

/** Message for a typed service error shown next to a form. */
export function errorMessage(t: PT, error: ProgressError): string {
  switch (error.code) {
    case "invalid_input":
      return t.errors.invalidInput;
    case "not_found":
      return t.errors.notFound;
    case "cohort_archived":
      return t.errors.cohortArchived;
    default:
      return t.errors.generic;
  }
}

/** Message for a failed stage save. */
export function saveErrorMessage(t: PT, code: string): string {
  const e = t.assess.errors as Record<string, string>;
  return e[code] ?? e.generic!;
}

/** "2026-09-01" -> localized short date. */
export function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
}
