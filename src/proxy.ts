import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/auth/config";

/**
 * Cheap gate: no DB access here. Unauthenticated requests (no session cookie) to app routes go to /login.
 * Real validation happens in requireAccount() / the API guards.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const headers = new Headers(request.headers);
  headers.set("x-yws-path", pathname + search);

  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next({ request: { headers } });

  if (pathname.startsWith("/api/")) {
    // Progress is non-disclosing: signed-out callers see the same 404 as everyone else.
    const status = pathname.startsWith("/api/progress") ? 404 : 401;
    return NextResponse.json({ error: status === 404 ? "not_found" : "unauthorized" }, { status });
  }
  const url = new URL("/login", request.url);
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!login|auth/|p/|api/health|asanas/|brand/|_next/|favicon\\.ico|icon\\.png|apple-icon\\.png).*)",
  ],
};
