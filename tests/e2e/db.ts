import { createHash, randomBytes } from "node:crypto";
import type { BrowserContext } from "@playwright/test";
import postgres from "postgres";
import { METHODOLOGIST_IDS } from "../../playwright.config";

export const SESSION_COOKIE = "yws_session";

let client: postgres.Sql | null = null;
export function sql(): postgres.Sql {
  client ??= postgres(process.env.DATABASE_URL ?? "postgres://yws:yws@localhost:5432/yws", { max: 2, onnotice: () => {} });
  return client;
}

/** Same hashing as src/server/auth/crypto.ts (sha256 hex of the raw cookie token). */
const sha256Hex = (v: string) => createHash("sha256").update(v).digest("hex");

export type Persona = { accountId: string; telegramId: string; name: string; username: string };

/** Inserts (or reuses) an account and a fresh session row, then installs the session cookie on the context. No app bypass. */
export async function signInAs(
  context: BrowserContext,
  who: { telegramId: string; name: string; username: string },
  baseURL = "http://localhost:3100",
): Promise<Persona> {
  const db = sql();
  const [acc] = await db<{ id: string }[]>`
    insert into account (telegram_id, name, username, last_login_at)
    values (${who.telegramId}, ${who.name}, ${who.username}, now())
    on conflict (telegram_id) do update set name = excluded.name, username = excluded.username
    returning id`;
  const token = randomBytes(32).toString("base64url");
  await db`
    insert into session (token_hash, account_id, expires_at, last_seen_at)
    values (${sha256Hex(token)}, ${acc!.id}, now() + interval '30 days', now())`;
  await context.addCookies([{ name: SESSION_COOKIE, value: token, url: baseURL, httpOnly: true, sameSite: "Lax" }]);
  return { accountId: acc!.id, ...who };
}

export const randomTelegramId = () => String(8_000_000_000 + Math.floor(Math.random() * 900_000_000));

export const teacherIdentity = () => ({
  telegramId: randomTelegramId(),
  name: `Ownerfox Teacher ${Math.floor(Math.random() * 1e6)}`,
  username: `ownerfox_${Math.floor(Math.random() * 1e6)}`,
});

export const methodologistIdentity = () => ({
  telegramId: METHODOLOGIST_IDS[0]!,
  name: "Methodologist E2E",
  username: "methodologist_e2e",
});
