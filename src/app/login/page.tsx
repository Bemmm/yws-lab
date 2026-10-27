import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/Card";
import { LocaleSwitch } from "@/components/LocaleSwitch";
import { Logo } from "@/components/Logo";
import { getDictionary, getLocale } from "@/i18n/server";
import { safeNext } from "@/server/auth/crypto";
import { getCurrentAccount } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).auth.signIn };
}

type Search = Promise<{ error?: string | string[]; next?: string | string[] }>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function LoginPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const next = safeNext(first(sp.next));
  if (await getCurrentAccount()) redirect(next);

  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const errorKey = first(sp.error);
  const errors = t.auth.errors as Record<string, string>;
  const errorText = errorKey ? (errors[errorKey] ?? errors.provider) : null;
  const href = `/auth/telegram${next !== "/plans" ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-bg-page p-4">
      <Card className="w-full max-w-sm items-center text-center">
        <Logo alt={t.app.name} size={96} />
        <h1 className="text-h2">{t.auth.loginTitle}</h1>
        <p>{t.auth.loginHint}</p>
        {errorText ? (
          <p role="alert" className="w-full rounded-md bg-red-soft p-3 text-red-ink">
            {errorText}
          </p>
        ) : null}
        {/* Plain anchor: this is a redirecting route handler, not a page to prefetch. */}
        <a href={href} className="y-btn y-btn-primary y-btn-lg">
          {errorText ? t.auth.retry : t.auth.continueWithTelegram}
        </a>
      </Card>
      <LocaleSwitch locale={locale} t={t} />
    </main>
  );
}
