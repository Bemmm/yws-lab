import { NextResponse } from "next/server";
import { appOrigin, OAUTH_COOKIE, telegramConfig } from "@/server/auth/config";
import { clearOAuthCookie, setSessionCookie } from "@/server/auth/cookies";
import { openOAuthState } from "@/server/auth/crypto";
import { AuthFlowError, exchangeCode, type AuthErrorCode } from "@/server/auth/oidc";
import { signIn } from "@/server/auth/service";
import { getDb } from "@/server/db/client";

export const dynamic = "force-dynamic";

function fail(request: Request, code: AuthErrorCode): NextResponse {
  const res = NextResponse.redirect(new URL(`/login?error=${code}`, appOrigin(request)), 303);
  clearOAuthCookie(res);
  return res;
}

/** Test seam: lets integration tests inject a fetch implementation. */
export const deps: { fetch: typeof fetch } = { fetch: (...a) => fetch(...a) };

export async function GET(request: Request) {
  const cfg = telegramConfig(request);
  if (!cfg) return fail(request, "config");

  const params = new URL(request.url).searchParams;
  const cookieHeader = request.headers.get("cookie") ?? "";
  const sealed = cookieHeader
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${OAUTH_COOKIE}=`))
    ?.slice(OAUTH_COOKIE.length + 1);
  const saved = await openOAuthState(sealed, process.env.SESSION_SECRET as string);

  // The state cookie is single-use: every outcome below clears it (replay protection).
  if (params.get("error")) return fail(request, params.get("error") === "access_denied" ? "cancelled" : "provider");
  const state = params.get("state");
  const code = params.get("code");
  if (!saved || !state || state !== saved.state) return fail(request, "state");
  if (!code) return fail(request, "provider");

  try {
    const identity = await exchangeCode(cfg, { code, verifier: saved.verifier, nonce: saved.nonce }, deps.fetch);
    const { token } = await signIn(getDb(), identity);
    const res = NextResponse.redirect(new URL(saved.next, cfg.appUrl), 303);
    setSessionCookie(res, token);
    clearOAuthCookie(res);
    return res;
  } catch (e) {
    return fail(request, e instanceof AuthFlowError ? e.code : "provider");
  }
}
