import { NextResponse } from "next/server";
import { telegramConfig } from "@/server/auth/config";
import { clearOAuthCookie, setOAuthCookie } from "@/server/auth/cookies";
import { pkceChallenge, randomToken, safeNext, sealOAuthState } from "@/server/auth/crypto";
import { appOrigin } from "@/server/auth/config";
import { buildAuthorizeUrl } from "@/server/auth/oidc";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cfg = telegramConfig(request);
  if (!cfg) {
    const res = NextResponse.redirect(new URL("/login?error=config", appOrigin(request)), 303);
    clearOAuthCookie(res);
    return res;
  }
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  const state = randomToken(24);
  const nonce = randomToken(24);
  const verifier = randomToken(48);
  const sealed = await sealOAuthState({ state, nonce, verifier, next }, process.env.SESSION_SECRET as string);
  const res = NextResponse.redirect(buildAuthorizeUrl(cfg, { state, nonce, challenge: pkceChallenge(verifier) }), 303);
  setOAuthCookie(res, sealed);
  return res;
}
