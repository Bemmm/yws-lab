import { NextResponse } from "next/server";
import { appOrigin, SESSION_COOKIE } from "@/server/auth/config";
import { clearSessionCookie } from "@/server/auth/cookies";
import { signOut } from "@/server/auth/service";
import { getDb } from "@/server/db/client";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const token = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  try {
    await signOut(getDb(), token ? decodeURIComponent(token) : undefined);
  } catch {
    // Still clear the cookie even if the DB is unreachable.
  }
  const res = NextResponse.redirect(new URL("/login", appOrigin(request)), 303);
  clearSessionCookie(res);
  return res;
}
