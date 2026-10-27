import type { Locale } from "./config";

export type PluralForms = { one: string; few: string; many: string; other: string };

/** Replace `{name}` placeholders. Unknown placeholders are left as they are. */
export function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
}

/** Pick the plural form for `n` in the locale (uk/ru: one, few, many) and fill `{n}`. */
export function plural(locale: Locale, forms: PluralForms, n: number, vars: Record<string, string | number> = {}): string {
  const category = new Intl.PluralRules(locale).select(n);
  const form = category === "one" || category === "few" || category === "many" ? forms[category] : forms.other;
  return format(form, { ...vars, n });
}

const DATE_LOCALE: Record<Locale, string> = { uk: "uk-UA", ru: "ru-RU" };

/** Dates are shown in the school timezone and the active locale. */
export function formatDate(locale: Locale, value: Date | string | number): string {
  return new Intl.DateTimeFormat(DATE_LOCALE[locale], { timeZone: "Europe/Kyiv", dateStyle: "medium" }).format(new Date(value));
}
