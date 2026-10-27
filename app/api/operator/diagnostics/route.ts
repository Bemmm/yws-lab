import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/server/telegram";
import { validOperatorKey } from "@/lib/server/operator";

export async function GET(request: Request) {
  const key = process.env.OPERATOR_KEY;
  if (!key || key.length < 32 || !env.DB) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  if (!await validOperatorKey(request.headers.get("x-operator-key"), key)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const origin = process.env.APP_ORIGIN;
  const secret = process.env.SESSION_SECRET;
  const clientId = process.env.TELEGRAM_CLIENT_ID;
  const clientSecret = process.env.TELEGRAM_CLIENT_SECRET;
  return NextResponse.json({
    authConfigReady: !!authConfig(),
    appOriginValid: !!origin && origin === "https://yws-lab-app.paletiger37.chatgpt.site",
    sessionSecretLength: secret?.length ?? 0,
    telegramClientIdPresent: !!clientId,
    telegramClientSecretPresent: !!clientSecret,
  }, { headers: { "Cache-Control": "no-store" } });
}
