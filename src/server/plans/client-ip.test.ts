import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { clientIp, shareThrottleKey } from "./client-ip";

const h = (o: Record<string, string>) => new Headers(o);

describe("clientIp", () => {
  it("prefers true-client-ip", () => {
    expect(clientIp(h({ "true-client-ip": "203.0.113.9", "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("203.0.113.9");
  });
  it("takes the right-most x-forwarded-for entry, ignoring spoofed left entries", () => {
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 7.7.7.7, 203.0.113.9" }))).toBe("203.0.113.9");
  });
  it("supports IPv6", () => {
    expect(clientIp(h({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
  });
  it("returns null when absent or malformed", () => {
    expect(clientIp(h({}))).toBeNull();
    expect(clientIp(h({ "x-forwarded-for": "not an ip" }))).toBeNull();
    expect(clientIp(h({ "true-client-ip": "<script>" }))).toBeNull();
  });
});

describe("shareThrottleKey", () => {
  it("keys by IP when known, by token otherwise (no shared bucket)", () => {
    expect(shareThrottleKey(h({ "true-client-ip": "203.0.113.9" }), "tok")).toBe("share:ip:203.0.113.9");
    expect(shareThrottleKey(h({}), "tokA")).not.toBe(shareThrottleKey(h({}), "tokB"));
  });
});
