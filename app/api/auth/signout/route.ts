import { NextRequest, NextResponse } from "next/server";
import { authConfig } from "@/lib/server/telegram";
import { deleteSession, SESSION_COOKIE } from "@/lib/server/auth";

export async function POST(request: NextRequest) {
  const config = authConfig();
  if (!config || request.headers.get("origin") !== config.origin) return new NextResponse(null, { status: 403 });
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  const response = NextResponse.redirect(new URL("/login", config.origin), 303);
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: config.secure, sameSite: "lax", path: "/", maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
