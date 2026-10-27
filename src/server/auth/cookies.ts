import type { NextResponse } from "next/server";
import { isProduction, OAUTH_COOKIE, OAUTH_TTL_SECONDS, SESSION_ABSOLUTE_MS, SESSION_COOKIE } from "./config";

const base = () => ({ httpOnly: true, secure: isProduction(), sameSite: "lax" as const, path: "/" });

export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE, token, { ...base(), maxAge: Math.floor(SESSION_ABSOLUTE_MS / 1000) });
}
export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", { ...base(), maxAge: 0 });
}
export function setOAuthCookie(res: NextResponse, value: string): void {
  res.cookies.set(OAUTH_COOKIE, value, { ...base(), maxAge: OAUTH_TTL_SECONDS });
}
export function clearOAuthCookie(res: NextResponse): void {
  res.cookies.set(OAUTH_COOKIE, "", { ...base(), maxAge: 0 });
}
