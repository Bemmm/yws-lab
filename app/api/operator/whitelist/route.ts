import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { validOperatorKey } from "@/lib/server/operator";

const headers = { "Cache-Control": "no-store" };
function reply(status: number, error: string) { return NextResponse.json({ error }, { status, headers }); }

export async function POST(request: Request) {
  const key = process.env.OPERATOR_KEY;
  if (!key || key.length < 32 || !env.DB) return reply(503, "Operator service unavailable.");
  if (!await validOperatorKey(request.headers.get("x-operator-key"), key)) return reply(403, "Forbidden.");
  if (request.headers.get("origin")) return reply(403, "Forbidden.");
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (!Number.isFinite(contentLength) || contentLength > 4096) return reply(413, "Request too large.");
  let input: unknown;
  try {
    const body = await request.text();
    if (body.length > 4096) return reply(413, "Request too large.");
    input = JSON.parse(body);
  } catch { return reply(400, "Invalid JSON."); }
  if (!input || typeof input !== "object" || Array.isArray(input)) return reply(400, "Invalid request.");
  const { telegramSubject, action } = input as Record<string, unknown>;
  if (typeof telegramSubject !== "string" || !/^[0-9]{1,32}$/.test(telegramSubject) || (action !== "grant" && action !== "revoke")) return reply(400, "Invalid request.");
  const db = env.DB, now = Date.now();
  const operation = action === "grant"
    ? db.prepare("INSERT INTO methodologist_whitelist (telegram_subject, granted_at, granted_by) VALUES (?, ?, ?) ON CONFLICT(telegram_subject) DO NOTHING").bind(telegramSubject, now, "operator_key")
    : db.prepare("DELETE FROM methodologist_whitelist WHERE telegram_subject = ?").bind(telegramSubject);
  const statements = [operation];
  if (action === "revoke") statements.push(db.prepare("DELETE FROM sessions WHERE account_id IN (SELECT id FROM accounts WHERE telegram_subject = ?)").bind(telegramSubject));
  statements.push(db.prepare("INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, metadata_json, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), `whitelist.${action}`, "methodologist_whitelist", telegramSubject, JSON.stringify({ actor: "operator_key" }), now));
  try { await db.batch(statements); } catch { return reply(500, "Operation failed."); }
  return NextResponse.json({ ok: true }, { headers });
}
