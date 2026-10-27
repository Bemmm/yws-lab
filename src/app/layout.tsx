import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/client";
import { getDictionary, getLocale } from "@/i18n/server";
import "@/styles/globals.css";

// Self-hosted Onest (variable, 100–900) so builds never depend on Google Fonts.
const onest = localFont({
  src: [
    { path: "./fonts/onest-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "./fonts/onest-latin-ext-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "./fonts/onest-cyrillic-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "./fonts/onest-cyrillic-ext-wght-normal.woff2", weight: "100 900", style: "normal" },
  ],
  variable: "--font-onest",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: { default: t.app.name, template: `%s · ${t.app.name}` }, description: t.app.tagline };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [locale, dictionary] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <html lang={locale} className={onest.variable}>
      <body>
        <I18nProvider locale={locale} dictionary={dictionary}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
