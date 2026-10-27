import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SkillBar } from "./SkillBar";

const html = (props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(SkillBar, { label: "Режим", value: 6, fromStartLabel: "від точки 0", fromPrevLabel: "від минулого", ...props }));

describe("SkillBar deltas", () => {
  it("renders an em dash plus label for null deltas on a scored competency", () => {
    const h = html({ fromStart: null, fromPrev: null });
    expect(h).toContain("— від точки 0");
    expect(h).toContain("— від минулого");
  });
  it("renders nothing for undefined deltas and signs for numbers", () => {
    expect(html({})).not.toContain("y-skill-deltas");
    const h = html({ fromStart: 3, fromPrev: -1 });
    expect(h).toContain("+3 від точки 0");
    expect(h).toContain("−1 від минулого");
  });
  it("shows no deltas for an unassessed competency", () => {
    expect(html({ value: null, fromStart: null, fromPrev: null, emptyLabel: "Не оцінено" })).not.toContain("y-skill-deltas");
  });
});
