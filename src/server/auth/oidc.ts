import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { TelegramConfig } from "./config";

export class AuthFlowError extends Error {
  constructor(public code: AuthErrorCode) {
    super(code);
  }
}

export type AuthErrorCode = "cancelled" | "state" | "provider" | "token" | "disabled" | "config";

export function buildAuthorizeUrl(cfg: TelegramConfig, p: { state: string; nonce: string; challenge: string }): string {
  const u = new URL(cfg.authUrl);
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid profile phone");
  u.searchParams.set("state", p.state);
  u.searchParams.set("code_challenge", p.challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("nonce", p.nonce);
  return u.toString();
}

export interface TelegramIdentity {
  telegramId: bigint;
  name: string | null;
  username: string | null;
  photoUrl: string | null;
  phone: string | null;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function jwksFor(url: string) {
  let set = jwksCache.get(url);
  if (!set) {
    set = createRemoteJWKSet(new URL(url));
    jwksCache.set(url, set);
  }
  return set;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function identityFromClaims(c: JWTPayload): TelegramIdentity {
  const raw = String(c.id ?? c.sub ?? "");
  if (!/^\d{1,19}$/.test(raw)) throw new AuthFlowError("token");
  return {
    telegramId: BigInt(raw),
    name: str(c.name),
    username: str(c.preferred_username),
    photoUrl: str(c.picture),
    phone: str(c.phone_number),
  };
}

/** Exchanges the code (PKCE) and verifies the ID token. Throws AuthFlowError. */
export async function exchangeCode(
  cfg: TelegramConfig,
  p: { code: string; verifier: string; nonce: string },
  fetchFn: typeof fetch = fetch,
): Promise<TelegramIdentity> {
  let idToken: unknown;
  try {
    const res = await fetchFn(cfg.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: p.code,
        redirect_uri: cfg.redirectUri,
        client_id: cfg.clientId,
        code_verifier: p.verifier,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new AuthFlowError("provider");
    idToken = ((await res.json()) as { id_token?: unknown }).id_token;
  } catch (e) {
    throw e instanceof AuthFlowError ? e : new AuthFlowError("provider");
  }
  if (typeof idToken !== "string") throw new AuthFlowError("provider");

  let claims: JWTPayload;
  try {
    ({ payload: claims } = await jwtVerify(idToken, jwksFor(cfg.jwksUrl), {
      issuer: cfg.issuer,
      audience: cfg.clientId,
      algorithms: ["RS256"],
    }));
  } catch {
    throw new AuthFlowError("token");
  }
  if (claims.nonce !== p.nonce) throw new AuthFlowError("token");
  return identityFromClaims(claims);
}
