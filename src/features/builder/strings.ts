"use client";

import { useLocale, useT } from "@/i18n/client";
import { format } from "@/i18n/format";
import { asanaParts } from "./asana-parts";

/** Builder strings come straight from the app dictionary (`builder.*`, same key shape as Papaya's workoutBuilder). */
export function useStrings() {
  return useT().builder;
}

export { useLocale, useT };

/** Localized image alt, e.g. "Асана L1 №1973" (never the raw "Frame 1973"). */
export function useAsanaAlt(): (asanaId: string) => string {
  const t = useStrings();
  return (asanaId) => {
    const { level, frame } = asanaParts(asanaId);
    return format(t.slot.asanaAlt, { level: level === "Other" ? t.library.other : level, frame });
  };
}
