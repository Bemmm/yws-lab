import { describe, expect, it } from "vitest";
import { isMethodologist, normalizePhone } from "./whitelist";

const env = {
  METHODOLOGIST_TELEGRAM_IDS: " 111 , 222,,",
  METHODOLOGIST_PHONES: "+380 (50) 123-45-67, 380671112233",
};

describe("normalizePhone", () => {
  it("keeps digits and adds a leading +", () => {
    expect(normalizePhone("+380 (50) 123-45-67")).toBe("+380501234567");
    expect(normalizePhone("380501234567")).toBe("+380501234567");
  });
  it("returns null for empty input", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
  });
});

describe("isMethodologist", () => {
  it("is false without an account", () => {
    expect(isMethodologist(null, env)).toBe(false);
  });
  it("matches by trimmed telegram id (bigint, number or string)", () => {
    expect(isMethodologist({ telegramId: 111n, phone: null }, env)).toBe(true);
    expect(isMethodologist({ telegramId: 222, phone: null }, env)).toBe(true);
    expect(isMethodologist({ telegramId: "111", phone: null }, env)).toBe(true);
    expect(isMethodologist({ telegramId: 333, phone: null }, env)).toBe(false);
  });
  it("matches by normalized phone", () => {
    expect(isMethodologist({ telegramId: 999, phone: "380501234567" }, env)).toBe(true);
    expect(isMethodologist({ telegramId: 999, phone: "+38 067 111 22 33" }, env)).toBe(true);
    expect(isMethodologist({ telegramId: 999, phone: "+380000000000" }, env)).toBe(false);
  });
  it("is false when env is empty or unset", () => {
    expect(isMethodologist({ telegramId: 111, phone: "+380501234567" }, {})).toBe(false);
    expect(
      isMethodologist({ telegramId: 111, phone: "+380501234567" }, { METHODOLOGIST_TELEGRAM_IDS: "", METHODOLOGIST_PHONES: "" }),
    ).toBe(false);
  });
  it("does not partially match ids", () => {
    expect(isMethodologist({ telegramId: 11, phone: null }, env)).toBe(false);
    expect(isMethodologist({ telegramId: 1111, phone: null }, env)).toBe(false);
  });
});
