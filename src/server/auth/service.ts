import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema";
import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, SESSION_TOUCH_MS } from "./config";
import { randomToken, sha256Hex } from "./crypto";
import { AuthFlowError, type TelegramIdentity } from "./oidc";

type Db = PostgresJsDatabase<typeof schema>;
const { account, session, auditEvent } = schema;

export type AccountRow = typeof account.$inferSelect;

/** Upserts the account by Telegram id and starts a fresh session. Returns the raw cookie token. */
export async function signIn(db: Db, identity: TelegramIdentity, now = new Date()) {
  const [existing] = await db.select().from(account).where(eq(account.telegramId, identity.telegramId));
  if (existing?.disabledAt) throw new AuthFlowError("disabled");

  // Profile + phone are refreshed on every login; an absent phone claim clears the stored one.
  const profile = {
    name: identity.name,
    username: identity.username,
    photoUrl: identity.photoUrl,
    phone: identity.phone,
    lastLoginAt: now,
  };
  const [acc] = await db
    .insert(account)
    .values({ telegramId: identity.telegramId, ...profile })
    .onConflictDoUpdate({ target: account.telegramId, set: profile })
    .returning();
  if (!acc) throw new AuthFlowError("provider");

  const token = randomToken(32);
  await db.insert(session).values({
    tokenHash: sha256Hex(token),
    accountId: acc.id,
    expiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS),
    lastSeenAt: now,
  });
  await db.insert(auditEvent).values({ actorId: acc.id, action: "auth.sign_in", entity: "account", entityId: acc.id });
  return { token, account: acc };
}

/** Resolves a raw session token to its account, enforcing idle/absolute expiry and disabled accounts. */
export async function lookupSession(db: Db, token: string | undefined, now = new Date()): Promise<AccountRow | null> {
  if (!token) return null;
  const hash = sha256Hex(token);
  const [row] = await db
    .select({ s: session, a: account })
    .from(session)
    .innerJoin(account, eq(account.id, session.accountId))
    .where(eq(session.tokenHash, hash));
  if (!row) return null;

  const idleOver = now.getTime() - row.s.lastSeenAt.getTime() >= SESSION_IDLE_MS;
  const absoluteOver = row.s.expiresAt.getTime() <= now.getTime();
  if (idleOver || absoluteOver) {
    await db.delete(session).where(eq(session.id, row.s.id));
    return null;
  }
  if (row.a.disabledAt) {
    await db.delete(session).where(eq(session.accountId, row.a.id));
    return null;
  }
  if (now.getTime() - row.s.lastSeenAt.getTime() > SESSION_TOUCH_MS) {
    await db.update(session).set({ lastSeenAt: now }).where(eq(session.id, row.s.id));
  }
  return row.a;
}

export async function signOut(db: Db, token: string | undefined): Promise<void> {
  if (!token) return;
  await db.delete(session).where(eq(session.tokenHash, sha256Hex(token)));
}
