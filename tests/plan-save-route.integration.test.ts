import { createHash, randomBytes } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runMigrations } from "../scripts/migrate.mjs";

vi.mock("server-only", () => ({}));

const url = process.env.DATABASE_URL_TEST ?? "postgres://yws:yws@localhost:5432/yws_test";
process.env.DATABASE_URL = url;
const sql = postgres(url, { max: 2, onnotice: () => {} });

let route: typeof import("@/app/api/plans/[id]/save/route");
let svc: typeof import("@/server/plans/service");
let ASANAS: typeof import("@/features/builder/asana-manifest").ASANAS;
let A = "";
let B = "";
let tokenA = "";
let tokenB = "";
const tag = `it-save-route-${Date.now()}`;

async function makeAccountWithSession(n: number): Promise<{ id: string; token: string }> {
  const [row] = await sql`insert into account (telegram_id, name) values (${Date.now() * 10 + n + 500}, ${`${tag}-${n}`}) returning id`;
  const token = randomBytes(32).toString("base64url");
  await sql`insert into session (token_hash, account_id, expires_at) values (${createHash("sha256").update(token).digest("hex")}, ${row!.id}, now() + interval '1 day')`;
  return { id: row!.id as string, token };
}

const doc = (title: string) => ({
  id: "x",
  title,
  sessions: [{ id: "s1", title: "Set", slots: [{ asana: { id: ASANAS[0]!.id, src: ASANAS[0]!.src, label: ASANAS[0]!.label } }], slotIds: ["u1"] }],
});

function post(id: string, body: unknown, opts: { token?: string; headers?: Record<string, string>; raw?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", ...opts.headers };
  if (opts.token) headers.cookie = `yws_session=${opts.token}`;
  return route.POST(
    new Request(`http://app.test/api/plans/${id}/save`, { method: "POST", headers, body: opts.raw ?? JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
}

const meta = (saveId: string, ...unackedSaveIds: string[]) => ({ saveId, unackedSaveIds });

beforeAll(async () => {
  await runMigrations(url);
  route = await import("@/app/api/plans/[id]/save/route");
  svc = await import("@/server/plans/service");
  ({ ASANAS } = await import("@/features/builder/asana-manifest"));
  ({ id: A, token: tokenA } = await makeAccountWithSession(1));
  ({ id: B, token: tokenB } = await makeAccountWithSession(2));
});

afterAll(async () => {
  await sql`delete from plan where owner_id in (${A}, ${B})`;
  await sql`delete from session where account_id in (${A}, ${B})`;
  await sql`delete from account where id in (${A}, ${B})`;
  await sql.end();
});

describe("POST /api/plans/[id]/save (keepalive flush)", () => {
  it("saves for the owner and returns the new version", async () => {
    const { id } = await svc.createPlan(A, { title: "r", setTitle: "S" });
    const res = await post(id, { document: doc("via route"), expectedVersion: 1, meta: meta("save-aaaaaaaa") }, { token: tokenA });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", version: 2 });
    expect((await svc.getPlan(A, id))!.program.title).toBe("via route");
  });

  it("401 without a session, nothing written", async () => {
    const { id } = await svc.createPlan(A, { title: "anon", setTitle: "S" });
    const res = await post(id, { document: doc("x"), expectedVersion: 1, meta: meta("save-aaaaaaaa") });
    expect(res.status).toBe(401);
    expect((await svc.getPlan(A, id))!.version).toBe(1);
  });

  it("404 for another account's plan, nothing written", async () => {
    const { id } = await svc.createPlan(A, { title: "private", setTitle: "S" });
    const res = await post(id, { document: doc("hijack"), expectedVersion: 1, meta: meta("save-aaaaaaaa") }, { token: tokenB });
    expect(res.status).toBe(404);
    expect((await svc.getPlan(A, id))!.program.title).toBe("private");
  });

  it("404 for a malformed plan id", async () => {
    const res = await post("not-a-uuid", { document: doc("x"), expectedVersion: 1, meta: meta("save-aaaaaaaa") }, { token: tokenA });
    expect(res.status).toBe(404);
  });

  it("409 on a stale version with the latest version", async () => {
    const { id } = await svc.createPlan(A, { title: "stale", setTitle: "S" });
    await svc.savePlan(A, id, doc("newer"), 1);
    const res = await post(id, { document: doc("old"), expectedVersion: 1, meta: meta("save-aaaaaaaa") }, { token: tokenA });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ status: "conflict", latestVersion: 2 });
  });

  it("recognises its own lost save through the route as well", async () => {
    const { id } = await svc.createPlan(A, { title: "own", setTitle: "S" });
    await svc.savePlan(A, id, doc("lost"), 1, meta("save-aaaaaaaa"));
    const res = await post(id, { document: doc("next"), expectedVersion: 1, meta: meta("save-bbbbbbbb", "save-aaaaaaaa") }, { token: tokenA });
    expect(res.status).toBe(200);
  });

  it("400 for an invalid document, bad envelope, bad meta and non-JSON; nothing written", async () => {
    const { id } = await svc.createPlan(A, { title: "valid", setTitle: "S" });
    const bad = [
      { document: { ...doc("x"), sessions: "nope" }, expectedVersion: 1, meta: meta("save-aaaaaaaa") },
      { document: doc("x"), expectedVersion: 0, meta: meta("save-aaaaaaaa") },
      { document: doc("x"), expectedVersion: "1", meta: meta("save-aaaaaaaa") },
      { document: doc("x"), expectedVersion: 1 },
      { document: doc("x"), expectedVersion: 1, meta: meta("short") },
      { document: doc("x"), expectedVersion: 1, meta: { saveId: "save-aaaaaaaa", unackedSaveIds: Array(11).fill("save-bbbbbbbb") } },
    ];
    for (const b of bad) expect((await post(id, b, { token: tokenA })).status).toBe(400);
    expect((await post(id, null, { token: tokenA, raw: "{not json" })).status).toBe(400);
    expect((await svc.getPlan(A, id))!.program.title).toBe("valid");
  });

  it("rejects wrong content type, cross-site requests and oversized bodies", async () => {
    const { id } = await svc.createPlan(A, { title: "guards", setTitle: "S" });
    const ok = { document: doc("x"), expectedVersion: 1, meta: meta("save-aaaaaaaa") };
    expect((await post(id, ok, { token: tokenA, headers: { "content-type": "text/plain" } })).status).toBe(415);
    expect((await post(id, ok, { token: tokenA, headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    expect((await post(id, ok, { token: tokenA, headers: { "sec-fetch-site": "same-origin" } })).status).toBe(200);
    const huge = await post(id, null, { token: tokenA, raw: JSON.stringify({ document: doc("x"), expectedVersion: 2, meta: meta("save-cccccccc"), pad: "x".repeat(300_000) }) });
    expect(huge.status).toBe(413);
  });
});
