/** Telegram OIDC + session configuration. Endpoint URLs are overridable by env so tests can point at a local fake. */
export const SESSION_COOKIE = "yws_session";
export const OAUTH_COOKIE = "yws_oauth";
export const OAUTH_TTL_SECONDS = 10 * 60;

export const SESSION_IDLE_MS = 14 * 24 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 60 * 24 * 60 * 60 * 1000;
export const SESSION_TOUCH_MS = 10 * 60 * 1000;

type Env = Record<string, string | undefined>;

export interface TelegramConfig {
  clientId: string;
  clientSecret: string;
  issuer: string;
  authUrl: string;
  tokenUrl: string;
  jwksUrl: string;
  redirectUri: string;
  appUrl: string;
}

export function isProduction(env: Env = process.env): boolean {
  return env.NODE_ENV === "production";
}

/** Origin the browser sees. Falls back to the request origin when APP_URL is unset (local dev). */
export function appOrigin(request: Request, env: Env = process.env): string {
  const raw = env.APP_URL?.trim();
  if (raw) return new URL(raw).origin;
  return new URL(request.url).origin;
}

export function telegramConfig(request: Request, env: Env = process.env): TelegramConfig | null {
  const clientId = env.TELEGRAM_CLIENT_ID?.trim();
  const clientSecret = env.TELEGRAM_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret || !env.SESSION_SECRET) return null;
  const issuer = env.TELEGRAM_ISSUER?.trim() || "https://oauth.telegram.org";
  const appUrl = appOrigin(request, env);
  return {
    clientId,
    clientSecret,
    issuer,
    authUrl: env.TELEGRAM_AUTH_URL?.trim() || "https://oauth.telegram.org/auth",
    tokenUrl: env.TELEGRAM_TOKEN_URL?.trim() || "https://oauth.telegram.org/token",
    jwksUrl: env.TELEGRAM_JWKS_URL?.trim() || "https://oauth.telegram.org/.well-known/jwks.json",
    redirectUri: `${appUrl}/auth/callback`,
    appUrl,
  };
}
