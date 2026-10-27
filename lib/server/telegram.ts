const encoder = new TextEncoder();
const issuer = "https://oauth.telegram.org";

export function authConfig() {
  const clientId = process.env.TELEGRAM_CLIENT_ID;
  const clientSecret = process.env.TELEGRAM_CLIENT_SECRET;
  const secret = process.env.SESSION_SECRET;
  const origin = process.env.APP_ORIGIN;
  if (!clientId || !clientSecret || !secret || secret.length < 32 || !origin) return null;
  try {
    const url = new URL(origin);
    if (url.origin !== origin || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) return null;
    return { clientId, clientSecret, secret, origin, secure: url.protocol === "https:" };
  } catch { return null; }
}

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function decode(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid encoding");
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
export function randomToken() { return base64url(crypto.getRandomValues(new Uint8Array(32))); }
export async function hash(value: string) { return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))); }
async function signingKey(secret: string) { return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]); }
export async function seal(value: object, secret: string) {
  const body = base64url(encoder.encode(JSON.stringify(value)));
  const signature = await crypto.subtle.sign("HMAC", await signingKey(secret), encoder.encode(body));
  return `${body}.${base64url(new Uint8Array(signature))}`;
}
export async function unseal(value: string, secret: string): Promise<unknown> {
  const parts = value.split(".");
  if (parts.length !== 2 || !await crypto.subtle.verify("HMAC", await signingKey(secret), decode(parts[1]), encoder.encode(parts[0]))) throw new Error("Invalid transaction");
  return JSON.parse(new TextDecoder().decode(decode(parts[0])));
}
export function safeReturnPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  try { const url = new URL(value, "https://local.invalid"); return url.origin === "https://local.invalid" && !url.pathname.startsWith("/api/auth/") ? `${url.pathname}${url.search}${url.hash}` : "/"; } catch { return "/"; }
}
export async function verifyIdToken(token: string, clientId: string, nonce: string) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token");
  const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
  const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("Unsupported signing key");
  const response = await fetch(`${issuer}/.well-known/jwks.json`, { cache: "no-store" });
  if (!response.ok) throw new Error("Key retrieval failed");
  const jwks = await response.json() as { keys?: (JsonWebKey & { kid?: string; alg?: string; use?: string })[] };
  const key = jwks.keys?.find(k => k.kid === header.kid && k.kty === "RSA" && (!k.alg || k.alg === "RS256") && (!k.use || k.use === "sig"));
  if (!key) throw new Error("Unknown signing key");
  const publicKey = await crypto.subtle.importKey("jwk", key, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, decode(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`))) throw new Error("Invalid signature");
  const now = Math.floor(Date.now() / 1000);
  const audience = typeof claims.aud === "string" ? [claims.aud] : claims.aud;
  if (claims.iss !== issuer || !Array.isArray(audience) || !audience.includes(clientId) || (audience.length > 1 && claims.azp !== clientId) || typeof claims.exp !== "number" || claims.exp <= now || typeof claims.iat !== "number" || claims.iat > now + 60 || (claims.nbf !== undefined && (typeof claims.nbf !== "number" || claims.nbf > now + 60)) || claims.nonce !== nonce || typeof claims.sub !== "string" || !claims.sub) throw new Error("Invalid claims");
  return { subject: claims.sub as string, username: typeof claims.preferred_username === "string" ? claims.preferred_username.slice(0, 255) : null, displayName: typeof claims.name === "string" ? claims.name.slice(0, 255) : "Користувач Telegram" };
}
