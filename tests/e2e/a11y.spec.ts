import AxeBuilder from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "./fixtures";
import { seedCohort, seedPlan } from "./seed";

const TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
const uid = () => Math.random().toString(36).slice(2, 8);

/** Axe scan (serious/critical fail the test) + a full-page screenshot in test-results/screens/. */
async function audit(page: Page, testInfo: TestInfo, name: string) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  // Next streams metadata into <head> for dynamic pages; give it a moment before judging the document title.
  await expect.poll(() => page.title(), { timeout: 5_000, message: `document.title on ${name}` }).not.toBe("").catch(() => {});
  await page.screenshot({ path: `test-results/screens/${testInfo.project.name}__${name}.png`, fullPage: true });
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const minor = results.violations.filter((v) => !blocking.includes(v));
  if (minor.length) {
    await testInfo.attach(`axe-minor-${name}.json`, {
      body: JSON.stringify(minor.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })), null, 2),
      contentType: "application/json",
    });
  }
  const head = blocking.some((v) => v.id === "document-title") ? `\nhead: ${(await page.locator("head").innerHTML()).slice(0, 600)}` : "";
  const summary = blocking.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).join("\n  ")}`);
  expect(summary.join("\n") + head, `axe violations on ${name}`).toBe("");
}

test.describe("accessibility and screenshots", () => {
  test("login", async ({ anonymous }, testInfo) => {
    await anonymous.goto("/login");
    await expect(anonymous.getByRole("heading", { level: 1 })).toBeVisible();
    await audit(anonymous, testInfo, "login");
  });

  test("teacher pages: library, editor, preview, public link", async ({ teacher, anonymous }, testInfo) => {
    const { page, persona } = teacher;
    const plan = await seedPlan(persona.accountId, { title: `A11y план ${uid()}`, shared: true });

    await page.goto("/plans");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await audit(page, testInfo, "plans");

    await page.goto(`/plans/${plan.id}`);
    await expect(page.getByRole("textbox", { name: "Назва плану" })).toBeVisible();
    await audit(page, testInfo, "editor");

    await page.goto(`/plans/${plan.id}/preview`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await audit(page, testInfo, "preview");

    await anonymous.goto(`/p/${plan.token}`);
    await expect(anonymous.getByRole("heading", { level: 1 })).toBeVisible();
    await audit(anonymous, testInfo, "public-plan");
  });

  test("methodologist pages: overview, assessment form, student", async ({ methodologist }, testInfo) => {
    const { page } = methodologist;
    const studentName = `Студентка ${uid()}`;
    const { cohortId, enrollmentId } = await seedCohort(`A11y потік ${uid()}`, studentName);

    await page.goto(`/progress/cohorts/${cohortId}`);
    await expect(page.getByRole("article", { name: studentName })).toBeVisible();
    await audit(page, testInfo, "cohort-overview");

    await page.goto(`/progress/cohorts/${cohortId}/students/${enrollmentId}/assess/m1`);
    await expect(page.locator('input[inputmode="numeric"]')).toHaveCount(16);
    await audit(page, testInfo, "assessment-form");

    await page.goto(`/progress/cohorts/${cohortId}/students/${enrollmentId}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(studentName);
    await audit(page, testInfo, "student");
  });
});
