import Link from "next/link";
import { Card } from "@/components/Card";
import { Logo } from "@/components/Logo";
import { getDictionary } from "@/i18n/server";

export default async function NotFound() {
  const t = await getDictionary();
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-page p-4">
      <Card className="w-full max-w-sm items-center text-center">
        <Logo alt={t.app.name} size={72} />
        <h1 className="text-h2">{t.notFound.title}</h1>
        <p>{t.notFound.body}</p>
        <Link href="/plans" className="y-btn y-btn-primary">
          {t.notFound.backHome}
        </Link>
      </Card>
    </main>
  );
}
