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

/** Origin the browser sees. APP_URL is required in production; the request origin is a dev/test fallback only. */
export function appOrigin(request: Request, env: Env = process.env): string | null {
  const raw = env.APP_URL?.trim();
  if (raw) {
    try {
      return new URL(raw).origin;
    } catch {
      return null;
    }
  }
  // Never trust the Host header in production.
  return isProduction(env) ? null : new URL(request.url).origin;
}

/** Endpoint overrides are honoured only outside production. */
function override(env: Env, key: string, fallback: string): string {
  const v = env[key]?.trim();
  return v && !isProduction(env) ? v : fallback;
}

export function telegramConfig(request: Request, env: Env = process.env): TelegramConfig | null {
  const clientId = env.TELEGRAM_CLIENT_ID?.trim();
  const clientSecret = env.TELEGRAM_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret || !env.SESSION_SECRET) return null;
  const appUrl = appOrigin(request, env);
  if (!appUrl) return null;
  return {
    clientId,
    clientSecret,
    issuer: override(env, "TELEGRAM_ISSUER", "https://oauth.telegram.org"),
    authUrl: override(env, "TELEGRAM_AUTH_URL", "https://oauth.telegram.org/auth"),
    tokenUrl: override(env, "TELEGRAM_TOKEN_URL", "https://oauth.telegram.org/token"),
    jwksUrl: override(env, "TELEGRAM_JWKS_URL", "https://oauth.telegram.org/.well-known/jwks.json"),
    redirectUri: `${appUrl}/auth/callback`,
    appUrl,
  };
}
