import { NextRequest, NextResponse } from "next/server";
import { ABSOLUTE_SESSION_MS, createTelegramSession, deleteSession, SESSION_COOKIE } from "@/lib/server/auth";
import { authConfig, safeReturnPath, unseal, verifyIdToken } from "@/lib/server/telegram";

export async function GET(request: NextRequest) {
  const config = authConfig();
  const fail = () => {
    const response = NextResponse.redirect(new URL("/login?error=auth", config?.origin ?? request.url));
    response.cookies.set("yws_oidc", "", { httpOnly: true, secure: config?.secure ?? true, sameSite: "lax", path: "/api/auth/callback", maxAge: 0 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
  if (!config) return fail();
  try {
    const transaction = await unseal(request.cookies.get("yws_oidc")?.value ?? "", config.secret) as { state?: unknown; nonce?: unknown; verifier?: unknown; returnTo?: unknown; createdAt?: unknown };
    const code = request.nextUrl.searchParams.get("code"), state = request.nextUrl.searchParams.get("state");
    if (!code || !state || typeof transaction.state !== "string" || state !== transaction.state || typeof transaction.nonce !== "string" || typeof transaction.verifier !== "string" || typeof transaction.createdAt !== "number" || transaction.createdAt > Date.now() || Date.now() - transaction.createdAt > 600_000) return fail();
    const tokenResponse = await fetch("https://oauth.telegram.org/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}` }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: `${config.origin}/api/auth/callback`, client_id: config.clientId, code_verifier: transaction.verifier }), cache: "no-store" });
    if (!tokenResponse.ok) return fail();
    const tokenData = await tokenResponse.json() as { id_token?: unknown };
    if (typeof tokenData.id_token !== "string") return fail();
    const profile = await verifyIdToken(tokenData.id_token, config.clientId, transaction.nonce);
    const oldToken = request.cookies.get(SESSION_COOKIE)?.value;
    if (oldToken) await deleteSession(oldToken);
    const session = await createTelegramSession(profile);
    const response = NextResponse.redirect(new URL(safeReturnPath(typeof transaction.returnTo === "string" ? transaction.returnTo : null), config.origin));
    response.cookies.set("yws_oidc", "", { httpOnly: true, secure: config.secure, sameSite: "lax", path: "/api/auth/callback", maxAge: 0 });
    response.cookies.set(SESSION_COOKIE, session, { httpOnly: true, secure: config.secure, sameSite: "lax", path: "/", maxAge: ABSOLUTE_SESSION_MS / 1000 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch { return fail(); }
}
