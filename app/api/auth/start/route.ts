import { NextRequest, NextResponse } from "next/server";
import { authConfig, hash, randomToken, safeReturnPath, seal } from "@/lib/server/telegram";

export async function GET(request: NextRequest) {
  const config = authConfig();
  if (!config) return NextResponse.redirect(new URL("/login?error=config", request.url));
  const state = randomToken(), nonce = randomToken(), verifier = randomToken();
  const transaction = await seal({ state, nonce, verifier, returnTo: safeReturnPath(request.nextUrl.searchParams.get("returnTo")), createdAt: Date.now() }, config.secret);
  const url = new URL("https://oauth.telegram.org/auth");
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: `${config.origin}/api/auth/callback`, response_type: "code", scope: "openid profile", state, nonce, code_challenge: await hash(verifier), code_challenge_method: "S256" }).toString();
  const response = NextResponse.redirect(url);
  response.cookies.set("yws_oidc", transaction, { httpOnly: true, secure: config.secure, sameSite: "lax", path: "/api/auth/callback", maxAge: 600 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
