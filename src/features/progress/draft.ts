/** Pure helpers for the assessment form draft (slider / numeric input linkage, dirty state). */
import { COMPETENCY_CODES, type CompetencyCode } from "@/server/progress/competencies";

export type Draft = Record<CompetencyCode, number | null>;

export const MIN_SCORE = 0;
export const MAX_SCORE = 10;

export function clampScore(n: number): number {
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, Math.round(n)));
}

/**
 * Interpret what the user typed in the numeric input.
 * "" -> null (unassessed); a number -> rounded and clamped to 0-10; anything else -> undefined (ignore the keystroke).
 */
export function parseScoreInput(raw: string): number | null | undefined {
  const s = raw.trim().replace(",", ".");
  if (s === "") return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return undefined;
  return clampScore(Number(s));
}

/** Slider position for a draft value: unassessed rows rest at 0 (and are rendered as unassessed). */
export function sliderPosition(value: number | null): number {
  return value === null ? MIN_SCORE : clampScore(value);
}

/** Value after a keyboard key on the slider; Home/End jump to 0/10, arrows move by 1. Null when the key is not handled. */
export function sliderKey(key: string, current: number | null): number | null {
  if (key === "Home") return MIN_SCORE;
  if (key === "End") return MAX_SCORE;
  if (key === "ArrowRight" || key === "ArrowUp") return clampScore((current ?? MIN_SCORE - 1) + 1);
  if (key === "ArrowLeft" || key === "ArrowDown") return current === null ? MIN_SCORE : clampScore(current - 1);
  return null;
}

export function toDraft(scores: Partial<Record<CompetencyCode, number | null>>): Draft {
  return Object.fromEntries(COMPETENCY_CODES.map((c) => [c, scores[c] ?? null])) as Draft;
}

export function changedCodes(base: Draft, draft: Draft): CompetencyCode[] {
  return COMPETENCY_CODES.filter((c) => base[c] !== draft[c]);
}

export function isDirty(base: Draft, draft: Draft): boolean {
  return changedCodes(base, draft).length > 0;
}

export function countAssessed(draft: Draft): number {
  return COMPETENCY_CODES.filter((c) => draft[c] !== null).length;
}

export function toPayload(draft: Draft): Record<string, number | null> {
  return Object.fromEntries(COMPETENCY_CODES.map((c) => [c, draft[c]]));
}

export const NOTE_MAX = 2000;

/** Trimmed note, empty -> null (what the server stores). */
export function normalizeNote(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  return v === "" ? null : v;
}

export function isNoteDirty(baseNote: string | null, draftNote: string): boolean {
  return normalizeNote(draftNote) !== normalizeNote(baseNote);
}
