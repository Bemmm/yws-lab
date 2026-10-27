import { setLocale } from "@/i18n/actions";
import { locales, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";

export function LocaleSwitch({ locale, t }: { locale: Locale; t: Dictionary }) {
  return (
    <form action={setLocale} aria-label={t.language.label} className="flex gap-1">
      {locales.map((l) => (
        <button
          key={l}
          type="submit"
          name="locale"
          value={l}
          lang={l}
          aria-pressed={l === locale}
          title={t.language[l]}
          className="rounded-pill px-3 text-caption font-bold uppercase text-ink-2 aria-pressed:bg-action-bg aria-pressed:text-action-fg"
          style={{ minHeight: "var(--tap-min)", minWidth: "var(--tap-min)" }}
        >
          {l}
        </button>
      ))}
    </form>
  );
}
