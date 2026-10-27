/**
 * Client IP for rate limiting behind Render's proxy (YWSLAB-71).
 *
 * Render terminates the connection and forwards the request with the real peer address: it sets `True-Client-IP`
 * and appends the peer it saw to `X-Forwarded-For`. Anything the caller put in `X-Forwarded-For` stays on the LEFT
 * of the list and is attacker-controlled, so the first hop must not be trusted (it would let anyone rotate their
 * throttle bucket). Choice, in order:
 *   1. `true-client-ip` (set by the platform), else
 *   2. the RIGHT-most `x-forwarded-for` entry (the one appended by Render), else
 *   3. null: the caller throttles per token instead of sharing one "unknown" bucket among all visitors.
 * Only the syntax of an IP literal is checked; the value is used as an opaque key and never logged.
 */
const IP_RE = /^[0-9A-Fa-f:.]{2,45}$/;

export function clientIp(headers: { get(name: string): string | null }): string | null {
  const direct = headers.get("true-client-ip")?.trim();
  if (direct && IP_RE.test(direct)) return direct;
  const parts = headers.get("x-forwarded-for")?.split(",") ?? [];
  const last = parts[parts.length - 1]?.trim();
  return last && IP_RE.test(last) ? last : null;
}

/** Throttle key for the public share page: per client IP, or per token when no trustworthy IP is available. */
export function shareThrottleKey(headers: { get(name: string): string | null }, token: string): string {
  const ip = clientIp(headers);
  return ip ? `share:ip:${ip}` : `share:token:${token}`;
}
