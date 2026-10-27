import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { drizzle } from "drizzle-orm/postgres-js";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "../scripts/migrate.mjs";
import * as schema from "../src/server/db/schema";

const url = process.env.DATABASE_URL_TEST ?? "postgres://yws:yws@localhost:5432/yws_test";
process.env.DATABASE_URL = url;
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";
process.env.APP_URL = "http://app.test";
process.env.TELEGRAM_CLIENT_ID = "123456";
process.env.TELEGRAM_CLIENT_SECRET = "shh";

// next/headers + next/navigation need a request scope; fake them for the page-level guards.
const cookieJar = { value: undefined as string | undefined };
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === "yws_session" && cookieJar.value ? { value: cookieJar.value } : undefined) }),
  headers: async () => new Headers({ "x-yws-path": "/progress" }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));

const sql = postgres(url, { max: 2, onnotice: () => {} });
const db = drizzle(sql, { schema });

let server: Server;
let origin = "";
let privateKey: CryptoKey;
let publicJwk: JWK;
let tokenResponse: () => { status: number; body: unknown } = () => ({ status: 500, body: {} });
let lastTokenRequest: { auth?: string; body?: URLSearchParams } = {};

type Routes = typeof import("../src/app/auth/telegram/route");
let telegramRoute: Routes;
let callbackRoute: typeof import("../src/app/auth/callback/route");
let signoutRoute: typeof import("../src/app/auth/signout/route");
let sessionMod: typeof import("../src/server/auth/session");
let service: typeof import("../src/server/auth/service");
let config: typeof import("../src/server/auth/config");

const TG_ID = 777001n;

beforeAll(async () => {
  await runMigrations(url);
  const kp = await generateKeyPair("RS256");
  privateKey = kp.privateKey;
  publicJwk = { ...(await exportJWK(kp.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  server = createServer((req, res) => {
    if (req.url?.startsWith("/jwks")) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ keys: [publicJwk] }));
      return;
    }
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      lastTokenRequest = { auth: req.headers.authorization, body: new URLSearchParams(raw) };
      const r = tokenResponse();
      res.statusCode = r.status;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(r.body));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.TELEGRAM_ISSUER = "https://oauth.telegram.org";
  process.env.TELEGRAM_TOKEN_URL = `${origin}/token`;
  process.env.TELEGRAM_JWKS_URL = `${origin}/jwks`;

  telegramRoute = await import("../src/app/auth/telegram/route");
  callbackRoute = await import("../src/app/auth/callback/route");
  signoutRoute = await import("../src/app/auth/signout/route");
  sessionMod = await import("../src/server/auth/session");
  service = await import("../src/server/auth/service");
  config = await import("../src/server/auth/config");
});

afterAll(async () => {
  await sql`delete from audit_event where entity = 'account' and action like 'auth.%'`;
  await sql`delete from account where telegram_id >= 777000 and telegram_id < 778000`;
  server?.close();
  await sql.end();
  const g = globalThis as unknown as { __ywsSql?: postgres.Sql };
  await g.__ywsSql?.end();
});

beforeEach(async () => {
  cookieJar.value = undefined;
  delete process.env.METHODOLOGIST_TELEGRAM_IDS;
  delete process.env.METHODOLOGIST_PHONES;
  await sql`delete from audit_event where entity = 'account' and action like 'auth.%'`;
  await sql`delete from account where telegram_id >= 777000 and telegram_id < 778000`;
});

function cookieHeader(res: Response): string {
  return res
    .headers.getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((c) => !c!.endsWith("="))
    .join("; ");
}
function setCookieOf(res: Response, name: string): string | undefined {
  return res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
}

interface Claims { id?: string | number; sub?: string; phone_number?: string | null; iss?: string; aud?: string; nonce?: string; exp?: number; name?: string }

async function idToken(nonce: string, over: Claims = {}) {
  const { phone_number, ...rest } = over;
  const jwt = new SignJWT({
    id: Number(TG_ID),
    name: "Anna Teacher",
    preferred_username: "anna_t",
    picture: "https://t.me/i/userpic/1.jpg",
    ...(phone_number === null ? {} : { phone_number: phone_number ?? undefined }),
    nonce,
    ...rest,
  })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setSubject(over.sub ?? String(TG_ID))
    .setIssuer(over.iss ?? "https://oauth.telegram.org")
    .setAudience(over.aud ?? "123456")
    .setIssuedAt();
  return jwt.setExpirationTime(over.exp ?? Math.floor(Date.now() / 1000) + 600).sign(privateKey);
}

/** Runs /auth/telegram, then /auth/callback with whatever the fake Telegram returns. */
async function login(opts: { claims?: Claims; nonce?: string; state?: string; next?: string; error?: string; tokenStatus?: number } = {}) {
  const start = await telegramRoute.GET(new Request(`http://app.test/auth/telegram${opts.next ? `?next=${encodeURIComponent(opts.next)}` : ""}`));
  const authorize = new URL(start.headers.get("location")!);
  const state = authorize.searchParams.get("state")!;
  const nonce = authorize.searchParams.get("nonce")!;
  const token = await idToken(opts.nonce ?? nonce, opts.claims);
  tokenResponse = () => ({ status: opts.tokenStatus ?? 200, body: { id_token: token } });
  const qs = opts.error ? `error=${opts.error}` : `code=abc&state=${opts.state ?? state}`;
  const res = await callbackRoute.GET(new Request(`http://app.test/auth/callback?${qs}`, { headers: { cookie: cookieHeader(start) } }));
  return { start, authorize, res, location: res.headers.get("location")!, session: setCookieOf(res, "yws_session") };
}

const sessionToken = (res: Response) => /yws_session=([^;]+)/.exec(setCookieOf(res, "yws_session") ?? "")?.[1];

describe("GET /auth/telegram", () => {
  it("redirects with PKCE, state, nonce and sets a short-lived HttpOnly cookie", async () => {
    const res = await telegramRoute.GET(new Request("http://app.test/auth/telegram?next=/plans/1"));
    const u = new URL(res.headers.get("location")!);
    expect(u.origin + u.pathname).toBe("https://oauth.telegram.org/auth");
    expect(u.searchParams.get("client_id")).toBe("123456");
    expect(u.searchParams.get("redirect_uri")).toBe("http://app.test/auth/callback");
    expect(u.searchParams.get("scope")).toBe("openid profile phone");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).toBeTruthy();
    const c = setOAuthCookie(res);
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=lax/i);
    expect(c).toMatch(/Max-Age=600/);
    expect(c).not.toMatch(/Secure/i);
  });
  it("ignores off-site next values", async () => {
    for (const bad of ["https://evil.test", "//evil.test", "/\\evil.test"]) {
      const { res, session } = await login({ next: bad });
      expect(new URL(res.headers.get("location")!).pathname).toBe("/plans");
      expect(session).toBeTruthy();
    }
  });
});
function setOAuthCookie(res: Response) {
  return setCookieOf(res, "yws_oauth");
}

describe("GET /auth/callback", () => {
  it("happy path: creates account, hashed session, cookie, audit row, honours next", async () => {
    const { res, location, session } = await login({ next: "/plans?x=1" });
    expect(location).toBe("http://app.test/plans?x=1");
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=lax/i);
    expect(session).toMatch(/Path=\//);
    expect(setCookieOf(res, "yws_oauth")).toMatch(/Max-Age=0/);

    // PKCE verifier and client auth reached the token endpoint.
    expect(lastTokenRequest.auth).toBe(`Basic ${Buffer.from("123456:shh").toString("base64")}`);
    expect(lastTokenRequest.body?.get("code_verifier")).toBeTruthy();
    expect(lastTokenRequest.body?.get("redirect_uri")).toBe("http://app.test/auth/callback");

    const [acc] = await sql`select * from account where telegram_id = ${TG_ID.toString()}`;
    expect(acc).toMatchObject({ name: "Anna Teacher", username: "anna_t", photo_url: "https://t.me/i/userpic/1.jpg" });
    const raw = sessionToken(res)!;
    const rows = await sql`select token_hash from session where account_id = ${acc!.id}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token_hash).not.toBe(raw);
    expect(rows[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
    const audit = await sql`select actor_id, action, data from audit_event where entity_id = ${acc!.id}`;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "auth.sign_in", actor_id: acc!.id, data: null });
  });

  it("each login gets a fresh token; the account is reused", async () => {
    const a = await login();
    const b = await login();
    expect(sessionToken(a.res)).not.toBe(sessionToken(b.res));
    expect(await sql`select 1 from account where telegram_id = ${TG_ID.toString()}`).toHaveLength(1);
  });

  it("rejects wrong state and a missing state cookie", async () => {
    const r = await login({ state: "nope" });
    expect(r.location).toBe("http://app.test/login?error=state");
    expect(r.session).toBeUndefined();
    const res = await callbackRoute.GET(new Request("http://app.test/auth/callback?code=x&state=y"));
    expect(res.headers.get("location")).toContain("error=state");
  });

  it("rejects a wrong nonce", async () => {
    const r = await login({ nonce: "other" });
    expect(r.location).toBe("http://app.test/login?error=token");
    expect(await sql`select 1 from account where telegram_id = ${TG_ID.toString()}`).toHaveLength(0);
  });

  it("rejects an expired token", async () => {
    const r = await login({ claims: { exp: Math.floor(Date.now() / 1000) - 60 } });
    expect(r.location).toContain("error=token");
  });

  it("rejects wrong audience and wrong issuer", async () => {
    expect((await login({ claims: { aud: "999" } })).location).toContain("error=token");
    expect((await login({ claims: { iss: "https://evil.test" } })).location).toContain("error=token");
  });

  it("rejects a token signed by an unknown key", async () => {
    const other = await generateKeyPair("RS256");
    const start = await telegramRoute.GET(new Request("http://app.test/auth/telegram"));
    const nonce = new URL(start.headers.get("location")!).searchParams.get("nonce")!;
    const bad = await new SignJWT({ id: 1, nonce })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setSubject("1").setIssuer("https://oauth.telegram.org").setAudience("123456").setExpirationTime("10m")
      .sign(other.privateKey);
    tokenResponse = () => ({ status: 200, body: { id_token: bad } });
    const res = await callbackRoute.GET(new Request("http://app.test/auth/callback?code=x&state=" + new URL(start.headers.get("location")!).searchParams.get("state"), { headers: { cookie: cookieHeader(start) } }));
    expect(res.headers.get("location")).toContain("error=token");
  });

  it("rejects a token without exp", async () => {
    const start = await telegramRoute.GET(new Request("http://app.test/auth/telegram"));
    const authorize = new URL(start.headers.get("location")!);
    const noExp = await new SignJWT({ id: Number(TG_ID), nonce: authorize.searchParams.get("nonce")! })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setSubject(String(TG_ID)).setIssuer("https://oauth.telegram.org").setAudience("123456").setIssuedAt()
      .sign(privateKey);
    tokenResponse = () => ({ status: 200, body: { id_token: noExp } });
    const res = await callbackRoute.GET(new Request(`http://app.test/auth/callback?code=x&state=${authorize.searchParams.get("state")}`, { headers: { cookie: cookieHeader(start) } }));
    expect(res.headers.get("location")).toContain("error=token");
  });

  it("maps cancel and provider failures to login error codes", async () => {
    expect((await login({ error: "access_denied" })).location).toBe("http://app.test/login?error=cancelled");
    expect((await login({ tokenStatus: 500 })).location).toBe("http://app.test/login?error=provider");
  });

  it("state cookie is single use (replay)", async () => {
    const start = await telegramRoute.GET(new Request("http://app.test/auth/telegram"));
    const authorize = new URL(start.headers.get("location")!);
    const token = await idToken(authorize.searchParams.get("nonce")!);
    tokenResponse = () => ({ status: 200, body: { id_token: token } });
    const req = () => new Request(`http://app.test/auth/callback?code=x&state=${authorize.searchParams.get("state")}`, { headers: { cookie: cookieHeader(start) } });
    const first = await callbackRoute.GET(req());
    expect(setCookieOf(first, "yws_oauth")).toMatch(/Max-Age=0/);
    // A browser that honoured the clear has no cookie any more.
    const replay = await callbackRoute.GET(new Request(`http://app.test/auth/callback?code=x&state=${authorize.searchParams.get("state")}`));
    expect(replay.headers.get("location")).toContain("error=state");
  });

  it("phone claim is stored on login and cleared when absent", async () => {
    await login({ claims: { phone_number: "+380501234567" } });
    expect((await sql`select phone from account where telegram_id = ${TG_ID.toString()}`)[0]!.phone).toBe("+380501234567");
    await login({ claims: { phone_number: null } });
    expect((await sql`select phone from account where telegram_id = ${TG_ID.toString()}`)[0]!.phone).toBeNull();
  });

  it("refreshes name, username and photo on every login", async () => {
    await login();
    await login({ claims: { name: "Anna Renamed" } });
    expect((await sql`select name from account where telegram_id = ${TG_ID.toString()}`)[0]!.name).toBe("Anna Renamed");
  });

  it("rejects disabled accounts without creating a session", async () => {
    await login();
    await sql`update account set disabled_at = now() where telegram_id = ${TG_ID.toString()}`;
    await sql`delete from session`;
    const r = await login();
    expect(r.location).toBe("http://app.test/login?error=disabled");
    expect(r.session).toBeUndefined();
    expect(await sql`select 1 from session`).toHaveLength(0);
  });
});

describe("sessions", () => {
  async function newSession() {
    const r = await login();
    const token = sessionToken(r.res)!;
    return { token, hash: (await sql`select id, account_id from session order by created_at desc limit 1`)[0]! };
  }

  it("resolves a valid session and slides last_seen_at at most every 10 minutes", async () => {
    const { token, hash } = await newSession();
    const now = new Date();
    expect(await service.lookupSession(db, token, now)).toMatchObject({ id: hash.account_id });
    const seen = async () => new Date((await sql`select last_seen_at from session where id = ${hash.id}`)[0]!.last_seen_at as string | Date);
    const before = await seen();
    await service.lookupSession(db, token, new Date(before.getTime() + 5 * 60_000));
    expect((await seen()).getTime()).toBe(before.getTime());
    const later = new Date(before.getTime() + 11 * 60_000);
    await service.lookupSession(db, token, later);
    expect((await seen()).getTime()).toBe(later.getTime());
  });

  it("expires after 14 idle days", async () => {
    const { token, hash } = await newSession();
    const idle = new Date(Date.now() + config.SESSION_IDLE_MS + 1000);
    expect(await service.lookupSession(db, token, idle)).toBeNull();
    expect(await sql`select 1 from session where id = ${hash.id}`).toHaveLength(0);
  });

  it("expires at 60 days even when active", async () => {
    const { token, hash } = await newSession();
    // Keep it active by pretending last_seen is recent, but past the absolute limit.
    const t = new Date(Date.now() + config.SESSION_ABSOLUTE_MS + 1000);
    await sql`update session set last_seen_at = ${t.toISOString()} where id = ${hash.id}`;
    expect(await service.lookupSession(db, token, t)).toBeNull();
    expect(await sql`select 1 from session where id = ${hash.id}`).toHaveLength(0);
  });

  it("disabling an account invalidates its sessions", async () => {
    const { token } = await newSession();
    await sql`update account set disabled_at = now()`.catch(() => {});
    await sql`update account set disabled_at = now() where telegram_id = ${TG_ID.toString()}`;
    expect(await service.lookupSession(db, token)).toBeNull();
    expect(await sql`select 1 from session`).toHaveLength(0);
  });

  it("sign-out deletes the session row and clears the cookie", async () => {
    const { token } = await newSession();
    const res = await signoutRoute.POST(new Request("http://app.test/auth/signout", { method: "POST", headers: { cookie: `yws_session=${token}` } }));
    expect(res.headers.get("location")).toBe("http://app.test/login");
    expect(setCookieOf(res, "yws_session")).toMatch(/Max-Age=0/);
    expect(await sql`select 1 from session`).toHaveLength(0);
    expect(await service.lookupSession(db, token)).toBeNull();
    expect(await sql`select 1 from audit_event where action = 'auth.sign_out'`).toHaveLength(1);
  });

  it("sign-out rejects a foreign Origin and keeps the session", async () => {
    const { token } = await newSession();
    const res = await signoutRoute.POST(new Request("http://app.test/auth/signout", { method: "POST", headers: { cookie: `yws_session=${token}`, origin: "https://evil.test" } }));
    expect(res.status).toBe(403);
    expect(await sql`select 1 from session`).toHaveLength(1);
    const ok = await signoutRoute.POST(new Request("http://app.test/auth/signout", { method: "POST", headers: { cookie: `yws_session=${token}`, origin: "http://app.test" } }));
    expect(ok.status).toBe(303);
  });
});

describe("config hardening", () => {
  it("ignores endpoint overrides and requires APP_URL in production", () => {
    const env = { NODE_ENV: "production", TELEGRAM_CLIENT_ID: "1", TELEGRAM_CLIENT_SECRET: "s", SESSION_SECRET: "x", TELEGRAM_TOKEN_URL: "http://evil/token", TELEGRAM_JWKS_URL: "http://evil/jwks", TELEGRAM_ISSUER: "evil" };
    const req = new Request("http://attacker.test/auth/telegram");
    expect(config.telegramConfig(req, env)).toBeNull();
    const cfg = config.telegramConfig(req, { ...env, APP_URL: "https://app.example" })!;
    expect(cfg.tokenUrl).toBe("https://oauth.telegram.org/token");
    expect(cfg.jwksUrl).toBe("https://oauth.telegram.org/.well-known/jwks.json");
    expect(cfg.issuer).toBe("https://oauth.telegram.org");
    expect(cfg.redirectUri).toBe("https://app.example/auth/callback");
  });
});

describe("authorization", () => {
  async function signInAs(over: Claims = {}) {
    const r = await login({ claims: over });
    cookieJar.value = sessionToken(r.res);
    return r;
  }

  it("requireAccount redirects signed-out users to /login?next=", async () => {
    await expect(sessionMod.requireAccount()).rejects.toThrow("NEXT_REDIRECT:/login?next=%2Fprogress");
  });

  it("requireMethodologist denies a regular account with notFound", async () => {
    await signInAs();
    await expect(sessionMod.requireMethodologist()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("allows by Telegram id and by verified phone", async () => {
    process.env.METHODOLOGIST_TELEGRAM_IDS = TG_ID.toString();
    await signInAs();
    await expect(sessionMod.requireMethodologist()).resolves.toMatchObject({ username: "anna_t" });

    delete process.env.METHODOLOGIST_TELEGRAM_IDS;
    process.env.METHODOLOGIST_PHONES = "+380 50 123 45 67";
    await signInAs({ phone_number: "+380501234567" });
    await expect(sessionMod.requireMethodologist()).resolves.toBeTruthy();
    // Declining to share the phone on the next login drops the phone match.
    await signInAs({ phone_number: null });
    await expect(sessionMod.requireMethodologist()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("whitelist revoke takes effect on the next request without re-login", async () => {
    process.env.METHODOLOGIST_TELEGRAM_IDS = TG_ID.toString();
    await signInAs();
    await expect(sessionMod.requireMethodologist()).resolves.toBeTruthy();
    process.env.METHODOLOGIST_TELEGRAM_IDS = "";
    await expect(sessionMod.requireMethodologist()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("guarded API route: 404 JSON for non-methodologists, signed-out and stale cookies; 200 for methodologists", async () => {
    const guarded = async (req: Request) => {
      const g = await sessionMod.requireMethodologistApi(req);
      return g.ok ? Response.json({ ok: true }) : g.response;
    };
    const r = await login();
    const cookie = `yws_session=${sessionToken(r.res)}`;

    for (const headers of [{ cookie }, {}, { cookie: "yws_session=garbage" }] as Record<string, string>[]) {
      const res = await guarded(new Request("http://app.test/api/progress/x", { headers }));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "not_found" });
    }
    process.env.METHODOLOGIST_TELEGRAM_IDS = TG_ID.toString();
    expect((await guarded(new Request("http://app.test/api/progress/x", { headers: { cookie } }))).status).toBe(200);
  });
});

describe("proxy", () => {
  it("redirects cookie-less app requests to /login?next= and lets public paths through", async () => {
    const { NextRequest } = await import("next/server");
    const { proxy } = await import("../src/proxy");
    const res = proxy(new NextRequest("http://app.test/plans/42?a=1"));
    expect(res.headers.get("location")).toBe("http://app.test/login?next=%2Fplans%2F42%3Fa%3D1");
    expect(proxy(new NextRequest("http://app.test/plans", { headers: { cookie: "yws_session=x" } })).headers.get("location")).toBeNull();
    expect(proxy(new NextRequest("http://app.test/api/progress/x")).status).toBe(404);
    expect(proxy(new NextRequest("http://app.test/api/plans")).status).toBe(401);
  });
});

