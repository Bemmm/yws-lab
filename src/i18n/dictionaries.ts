import { ru } from "./ru";
import { uk, type Dictionary } from "./uk";
import type { Locale } from "./config";

export type { Dictionary };

const dictionaries: Record<Locale, Dictionary> = { uk, ru };

export function dictionaryFor(locale: Locale): Dictionary {
  return dictionaries[locale];
}
