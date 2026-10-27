import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authConfig, hash, randomToken } from "./telegram";

export const SESSION_COOKIE = "yws_session";
export const ABSOLUTE_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
export const IDLE_SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export type AuthUser = { id: string; displayName: string; username: string | null; isMethodologist: boolean };
function database() { if (!env.DB) throw new Error("D1 database unavailable"); return env.DB; }

export async function createTelegramSession(profile: { subject: string; username: string | null; displayName: string }) {
  const db = database();
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO accounts (id, telegram_subject, username, display_name) VALUES (?, ?, ?, ?) ON CONFLICT(telegram_subject) DO UPDATE SET username = excluded.username, display_name = excluded.display_name").bind(id, profile.subject, profile.username, profile.displayName).run();
  const account = await db.prepare("SELECT id, disabled FROM accounts WHERE telegram_subject = ?").bind(profile.subject).first<{ id: string; disabled: number }>();
  if (!account || account.disabled) throw new Error("Account disabled");
  const token = randomToken(), now = Date.now();
  await db.prepare("INSERT INTO sessions (id_hash, account_id, expires_at, idle_expires_at) VALUES (?, ?, ?, ?)").bind(await hash(token), account.id, now + ABSOLUTE_SESSION_MS, now + IDLE_SESSION_MS).run();
  return token;
}

export async function deleteSession(token: string) {
  await database().prepare("DELETE FROM sessions WHERE id_hash = ?").bind(await hash(token)).run();
}

export async function getAuthUser(): Promise<AuthUser | null> {
  if (!authConfig()) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const db = database(), tokenHash = await hash(token), now = Date.now();
  const row = await db.prepare("SELECT a.id, a.display_name, a.username, EXISTS (SELECT 1 FROM methodologist_whitelist w WHERE w.telegram_subject = a.telegram_subject) AS is_methodologist FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.id_hash = ? AND s.expires_at > ? AND s.idle_expires_at > ? AND a.disabled = 0").bind(tokenHash, now, now).first<{ id: string; display_name: string; username: string | null; is_methodologist: number }>();
  if (!row) return null;
  await db.prepare("UPDATE sessions SET idle_expires_at = MIN(expires_at, ?) WHERE id_hash = ? AND expires_at > ? AND idle_expires_at > ?").bind(now + IDLE_SESSION_MS, tokenHash, now, now).run();
  return { id: row.id, displayName: row.display_name, username: row.username, isMethodologist: !!row.is_methodologist };
}
export async function requireAuthUser(returnTo = "/") {
  const user = await getAuthUser();
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  return user;
}
