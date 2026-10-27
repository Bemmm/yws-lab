import Link from "next/link";
import type { ReactNode } from "react";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentAccount } from "@/server/auth/session";
import { isMethodologist } from "@/server/auth/whitelist";
import { LocaleSwitch } from "./LocaleSwitch";
import { Logo } from "./Logo";
import { NavItem } from "./NavItem";

export async function AppShell({ active, children }: { active: "plans" | "progress"; children: ReactNode }) {
  const [t, locale, account] = await Promise.all([getDictionary(), getLocale(), getCurrentAccount()]);
  const showProgress = isMethodologist(account);

  return (
    <div className="flex min-h-screen flex-col bg-bg-page md:flex-row">
      <aside className="flex flex-col gap-5 p-4 md:sticky md:top-0 md:h-screen md:w-(--sidebar-w) md:shrink-0 md:p-5">
        <Link href="/plans" className="inline-flex w-fit rounded-md" aria-label={t.app.name}>
          <Logo alt={t.app.name} size={56} />
        </Link>
        <nav aria-label={t.nav.main} className="flex flex-col gap-1">
          <NavItem label={t.nav.plans} href="/plans" active={active === "plans"} />
          {showProgress ? <NavItem label={t.nav.progress} href="/progress" active={active === "progress"} /> : null}
        </nav>
        <div className="mt-auto flex items-center justify-between gap-3">
          {account ? (
            <span className="truncate text-body-strong">{account.name ?? account.username ?? t.auth.guest}</span>
          ) : (
            <Link href="/login" className="y-nav">
              {t.auth.signIn}
            </Link>
          )}
          <LocaleSwitch locale={locale} t={t} />
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-7">{children}</main>
    </div>
  );
}
