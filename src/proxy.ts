import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/auth/config";

const isProd = process.env.NODE_ENV === "production";

/**
 * Per-request nonce CSP. Next 16 reads the nonce from the request's CSP header and stamps it on its own inline
 * scripts. All pages here are already dynamic (cookies/searchParams), so the nonce costs no static optimisation.
 * Trade-off: style-src keeps 'unsafe-inline' (React style attributes, Next/Tailwind inline <style>); the nonce
 * blocks script injection, style injection is an accepted residual risk (see docs/review-1.0.md).
 */
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isProd ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    // Telegram avatars: t.me/i/userpic redirects to a *.telesco.pe CDN, and redirects are checked against CSP too.
    "img-src 'self' data: blob: https://*.telegram.org https://t.me https://*.telesco.pe",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self' https://oauth.telegram.org",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

/** Routes that need no session. */
const OPEN = /^\/(login|auth\/|p\/|api\/health)/;

/**
 * Cheap gate: no DB access here. Unauthenticated requests (no session cookie) to app routes go to /login.
 * Real validation happens in requireAccount() / the API guards. Also issues the CSP nonce for page requests.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const headers = new Headers(request.headers);
  headers.set("x-yws-path", pathname + search);
  const open = OPEN.test(pathname) || request.cookies.has(SESSION_COOKIE);

  if (pathname.startsWith("/api/")) {
    if (open) return NextResponse.next({ request: { headers } });
    // Progress is non-disclosing: signed-out callers see the same 404 as everyone else.
    const status = pathname.startsWith("/api/progress") ? 404 : 401;
    return NextResponse.json({ error: status === 404 ? "not_found" : "unauthorized" }, { status });
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  let res: NextResponse;
  if (open) res = NextResponse.next({ request: { headers } });
  else {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    res = NextResponse.redirect(url);
  }
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: ["/((?!asanas/|brand/|_next/static|_next/image|favicon\\.ico|icon\\.png|apple-icon\\.png).*)"],
};
