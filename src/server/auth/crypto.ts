import { createHash, randomBytes } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";
import { OAUTH_TTL_SECONDS } from "./config";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function key(secret: string): Uint8Array {
  return createHash("sha256").update(`yws-oauth:${secret}`).digest();
}

export interface OAuthState {
  state: string;
  nonce: string;
  verifier: string;
  next: string;
}

export async function sealOAuthState(payload: OAuthState, secret: string): Promise<string> {
  return new EncryptJWT({ ...payload })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${OAUTH_TTL_SECONDS}s`)
    .encrypt(key(secret));
}

export async function openOAuthState(token: string | undefined, secret: string): Promise<OAuthState | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, key(secret));
    const { state, nonce, verifier, next } = payload as Record<string, unknown>;
    if ([state, nonce, verifier, next].some((v) => typeof v !== "string")) return null;
    return { state, nonce, verifier, next } as OAuthState;
  } catch {
    return null;
  }
}

/** Same-origin relative path only; anything else falls back to /plans. */
export function safeNext(raw: string | null | undefined): string {
  const fallback = "/plans";
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || /[\\\u0000-\u001f]/.test(raw)) return fallback;
  try {
    const u = new URL(raw, "http://local.invalid");
    if (u.origin !== "http://local.invalid") return fallback;
    if (u.pathname.startsWith("/login") || u.pathname.startsWith("/auth/")) return fallback;
    return u.pathname + u.search;
  } catch {
    return fallback;
  }
}
