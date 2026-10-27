import { describe, expect, it } from "vitest";
import { uk } from "@/i18n/uk";
import { ru } from "@/i18n/ru";
import { attentionReason, fmt, formatGain, formatLevel, localizeDecimal, pillStatus, stageLabel } from "./format";

describe("format", () => {
  it("fills templates", () => {
    expect(fmt("{a} з {b}", { a: 3, b: "x" })).toBe("3 з x");
    expect(fmt("{a} {zz}", { a: 1 })).toBe("1 {zz}");
  });
  it("uses a comma decimal separator for uk/ru and rounds only for display", () => {
    expect(localizeDecimal("1.5", "uk")).toBe("1,5");
    expect(formatLevel(6.25, "uk")).toBe("6,3");
    expect(formatLevel(null, "uk")).toBe("—");
    expect(formatGain(-0.3, "ru")).toBe("−0,3");
    expect(formatGain(0.04, "ru")).toBe("+0,0");
    expect(formatGain(-0.04, "uk")).toBe("−0,0");
    expect(formatGain(0, "uk")).toBe("0");
  });
  it("labels stages and statuses", () => {
    expect(stageLabel(uk.progress, "m3")).toBe("Модуль 3");
    expect(stageLabel(ru.progress, "final")).toBe("Финал");
    expect(pillStatus("only_point0")).toBe("pending");
    expect(pillStatus("rapid")).toBe("rapid");
  });
  it("explains attention", () => {
    expect(
      attentionReason(ru.progress, { label: "attention", delta: -0.5, from: "m1", to: "m2", reason: { kind: "level_fall", delta: -0.5 } }, "ru"),
    ).toBe("Уровень снизился на −0,5 (Модуль 1 → Модуль 2)");
    const r = attentionReason(
      uk.progress,
      { label: "attention", delta: 0.2, from: "point0", to: "m1", reason: { kind: "competency_fall", code: "confidence", fall: 2, others: 1 } },
      "uk",
    );
    expect(r).toContain("Впевненість");
    expect(r).toContain("ще компетенцій");
    expect(attentionReason(uk.progress, { label: "steady", delta: 1, from: "a", to: "b", reason: null }, "uk")).toBeNull();
  });
});
