import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getAuthUser, type AuthUser } from "./auth";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function database(): D1Database {
  if (!env.DB) throw new ApiError(503, "Сховище тимчасово недоступне.");
  return env.DB;
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) throw new ApiError(401, "Потрібно увійти.");
  return user;
}

export async function requireMethodologist(): Promise<AuthUser> {
  const user = await requireUser();
  if (!user.isMethodologist) throw new ApiError(404, "Не знайдено.");
  return user;
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function empty(status = 204) {
  return new NextResponse(null, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function fail(error: unknown) {
  if (error instanceof ApiError) return json({ error: error.message }, error.status);
  console.error("API request failed", error instanceof Error ? error.message : "Unknown error");
  return json({ error: "Не вдалося виконати запит." }, 500);
}

export async function bodyObject(request: Request): Promise<Record<string, unknown>> {
  const size = Number(request.headers.get("content-length") || 0);
  if (size > 1_000_000) throw new ApiError(413, "Запит завеликий.");
  let body: unknown;
  try { body = await request.json(); } catch { throw new ApiError(400, "Некоректний JSON."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "Некоректні дані.");
  return body as Record<string, unknown>;
}

export function assertOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new ApiError(403, "Запит заборонено.");
}

export function stringField(value: unknown, min: number, max: number, label: string) {
  if (typeof value !== "string" || value.trim().length < min || value.length > max) throw new ApiError(400, `Некоректне поле: ${label}.`);
  return value.trim();
}

export async function audit(db: D1Database, actorId: string | null, action: string, entityType: string, entityId: string, metadata: Record<string, unknown> = {}) {
  await db.prepare("INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actorId, action, entityType, entityId, JSON.stringify(metadata), Date.now()).run();
}
