import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "@/components/i18n/language";

export const metadata: Metadata = {
  title: "YWS Lab",
  description: "Плани тренувань і прогрес навчання YWS Lab",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk">
      <body className="antialiased"><LanguageProvider>{children}</LanguageProvider></body>
    </html>
  );
}
