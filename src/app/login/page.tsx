import type { Metadata } from "next";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { LocaleSwitch } from "@/components/LocaleSwitch";
import { Logo } from "@/components/Logo";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).auth.signIn };
}

export default async function LoginPage() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-bg-page p-4">
      <Card className="w-full max-w-sm items-center text-center">
        <Logo alt={t.app.name} size={96} />
        <h1 className="text-h2">{t.auth.loginTitle}</h1>
        <p>{t.auth.loginHint}</p>
        <Button size="lg" disabled>
          {t.auth.continueWithTelegram}
        </Button>
      </Card>
      <LocaleSwitch locale={locale} t={t} />
    </main>
  );
}
