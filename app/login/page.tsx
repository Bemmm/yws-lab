import { authConfig, safeReturnPath } from "@/lib/server/telegram";
import Image from "next/image";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; returnTo?: string }> }) {
  const params = await searchParams;
  const configured = !!authConfig();
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "linear-gradient(135deg, #5035A9, #4377D4, #8FD9D1)" }}>
    <section style={{ width: "min(100%, 440px)", background: "white", padding: 40, borderRadius: 24, color: "#17181C" }}>
      <Image src="/yws-lab-logo.png" alt="YWS Lab" width={148} height={82} style={{ width: 148, height: "auto" }} priority />
      <h1 style={{ fontSize: 36, lineHeight: 1.15, margin: "16px 0" }}>Вітаємо в YWS-Lab</h1>
      <p style={{ color: "#60636E", lineHeight: 1.5 }}>Увійдіть через Telegram, щоб працювати з планами тренувань.</p>
      {params.error && configured && <p role="alert" style={{ color: "#B42318" }}>Не вдалося увійти. Спробуйте ще раз.</p>}
      {configured ? <a href={`/api/auth/start?returnTo=${encodeURIComponent(safeReturnPath(params.returnTo ?? null))}`} style={{ display: "block", textAlign: "center", background: "#17181C", color: "white", borderRadius: 12, padding: 14, marginTop: 24, fontWeight: 600 }}>Продовжити з Telegram</a> : <p role="status" style={{ marginTop: 24, color: "#60636E" }}>Вхід через Telegram ще налаштовується. Спробуйте пізніше.</p>}
    </section>
  </main>;
}
