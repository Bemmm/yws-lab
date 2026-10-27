export const locales = ["uk", "ru"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "uk";
export const LOCALE_COOKIE = "locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
