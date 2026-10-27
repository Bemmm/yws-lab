import type { CSSProperties } from "react";
import { SLOT_COLORS, type SlotColor } from "./model";

/** Slot colours as design-token references (`--slot-*` in tokens.css). Colour is never the only carrier of data. */
export const PAINT_COLORS = SLOT_COLORS.map((key) => ({
  key,
  swatch: `var(--slot-${key})`,
  band: `var(--slot-${key}-band)`,
  ink: `var(--slot-${key}-ink)`,
}));

const BY_KEY = new Map<string, (typeof PAINT_COLORS)[number]>(PAINT_COLORS.map((c) => [c.key, c]));

/** Band background + readable ink for a colour key; undefined for no/unknown colour. */
export function bandStyle(color: SlotColor | null | undefined): CSSProperties | undefined {
  const c = color ? BY_KEY.get(color) : undefined;
  return c ? { backgroundColor: c.band, color: c.ink } : undefined;
}

export function inkColor(color: SlotColor | null | undefined): string | undefined {
  return color ? BY_KEY.get(color)?.ink : undefined;
}

/** Keeps backgrounds when printing (browsers drop them by default). */
export const EXACT_PRINT_COLORS: CSSProperties = { printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" };
