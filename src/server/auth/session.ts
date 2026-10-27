import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getDb } from "../db/client";
import { SESSION_COOKIE } from "./config";
import { safeNext } from "./crypto";
import { lookupSession, type AccountRow } from "./service";
import { isMethodologist, type WhitelistSubject } from "./whitelist";

export interface CurrentAccount extends WhitelistSubject {
  id: string;
  name: string | null;
  username: string | null;
  photoUrl: string | null;
  locale: string;
}

function toCurrent(a: AccountRow): CurrentAccount {
  return {
    id: a.id,
    telegramId: a.telegramId,
    phone: a.phone,
    name: a.name,
    username: a.username,
    photoUrl: a.photoUrl,
    locale: a.locale,
  };
}

/** Signed-in account for this request (memoized per request), or null. */
export const getCurrentAccount = cache(async (): Promise<CurrentAccount | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const acc = await lookupSession(getDb(), token);
  return acc ? toCurrent(acc) : null;
});

export async function requireAccount(): Promise<CurrentAccount> {
  const account = await getCurrentAccount();
  if (account) return account;
  const path = (await headers()).get("x-yws-path");
  redirect(`/login?next=${encodeURIComponent(safeNext(path))}`);
}

/** Non-methodologists get the same 404 as a missing page. Role is re-evaluated from env on every call. */
export async function requireMethodologist(): Promise<CurrentAccount> {
  const account = await getCurrentAccount();
  if (!isMethodologist(account)) notFound();
  return account as CurrentAccount;
}

// ---- Route-handler (API) equivalents: work from the Request, return a 404 JSON for denied callers. ----

function cookieFromRequest(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export async function getAccountFromRequest(request: Request): Promise<CurrentAccount | null> {
  const acc = await lookupSession(getDb(), cookieFromRequest(request, SESSION_COOKIE));
  return acc ? toCurrent(acc) : null;
}

export function notFoundJson(): NextResponse {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

/** Usage: `const g = await requireMethodologistApi(req); if (!g.ok) return g.response;` */
export async function requireMethodologistApi(
  request: Request,
): Promise<{ ok: true; account: CurrentAccount } | { ok: false; response: NextResponse }> {
  const account = await getAccountFromRequest(request);
  if (!account || !isMethodologist(account)) return { ok: false, response: notFoundJson() };
  return { ok: true, account };
}

/** Account-only API guard (401 JSON when signed out). */
export async function requireAccountApi(
  request: Request,
): Promise<{ ok: true; account: CurrentAccount } | { ok: false; response: NextResponse }> {
  const account = await getAccountFromRequest(request);
  if (!account) return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  return { ok: true, account };
}
