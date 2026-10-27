import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const uid = () => Math.random().toString(36).slice(2, 8);

/** aria-labels of the filled slots, in DOM order (diagnostic output when the order is wrong). */
const slotLabels = (page: Page) => page.locator('[aria-label^="Слот "][aria-roledescription]').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));

test.describe("teacher: training plans", () => {
  test("create, edit, autosave, reload, duplicate, preview, share, revoke", async ({ teacher, otherTeacher, anonymous, browser, baseURL }) => {
    const { page, persona } = teacher;
    const title = `E2E план ${uid()}`;

    // Create a plan from the library.
    await page.goto("/plans");
    await page.getByRole("button", { name: "Новий план" }).first().click();
    await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}$/);
    const planId = page.url().split("/").pop()!;

    // Title edit -> autosave indicator.
    await page.getByRole("textbox", { name: "Назва плану" }).fill(title);
    await expect(page.getByRole("status").filter({ hasText: "Збережено" }).first()).toBeVisible({ timeout: 20_000 });

    // Second set.
    await page.getByRole("button", { name: "+ Сет" }).click();
    await expect(page.getByRole("textbox", { name: "Назва сету" })).toHaveCount(2);

    // Catalog click adds to the first free slot (two different asanas).
    const catalog = page.getByRole("button", { name: /^Асана / });
    const nameA = (await catalog.nth(0).getAttribute("aria-label"))!;
    const nameB = (await catalog.nth(1).getAttribute("aria-label"))!;
    expect(nameA).not.toBe(nameB);
    await catalog.nth(0).click();
    await catalog.nth(1).click();
    await expect(page.getByRole("group", { name: `Слот 1: ${nameA}` })).toBeVisible();
    await expect(page.getByRole("group", { name: `Слот 2: ${nameB}` })).toBeVisible();

    // Keyboard path: focus the move button and press Enter.
    const moveLater = page.getByRole("button", { name: "Перемістити слот пізніше" }).first();
    await moveLater.focus();
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await slotLabels(page)).slice(0, 2), { message: "slot order after keyboard move" }).toEqual([`Слот 1: ${nameB}`, `Слот 2: ${nameA}`]);
    await expect(page.getByRole("group", { name: `Слот 1: ${nameB}` })).toBeVisible();
    await expect(page.getByRole("group", { name: `Слот 2: ${nameA}` })).toBeVisible();

    // Saved, then reload shows the same data.
    await expect(page.getByRole("status").filter({ hasText: "Збережено" }).first()).toBeVisible({ timeout: 20_000 });
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Назва плану" })).toHaveValue(title);
    await expect(page.getByRole("textbox", { name: "Назва сету" })).toHaveCount(2);
    await expect(page.getByRole("group", { name: `Слот 1: ${nameB}` })).toBeVisible();
    await expect(page.getByRole("group", { name: `Слот 2: ${nameA}` })).toBeVisible();

    // Preview (owner-only page).
    await page.goto(`/plans/${planId}/preview`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);

    // Library: duplicate from the card menu.
    await page.goto("/plans");
    await page.getByRole("button", { name: `Дії з планом «${title}»` }).click();
    await page.getByRole("menuitem", { name: "Дублювати" }).click();
    await expect(page.getByRole("heading", { name: `${title} (копія)` })).toBeVisible();

    // Share: enable in the editor, open anonymously.
    await page.goto(`/plans/${planId}`);
    await page.getByRole("button", { name: "Поділитися" }).click();
    const link = page.getByRole("textbox", { name: "Публічне посилання" });
    await expect(link).toHaveValue(/\/p\/[A-Za-z0-9_-]{16,}$/);
    const shareUrl = await link.inputValue();

    const publicResponse = await anonymous.goto(shareUrl);
    expect(publicResponse?.status()).toBe(200);
    await expect(anonymous.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(anonymous.getByText("Лише перегляд")).toBeVisible();
    const body = await anonymous.locator("body").innerText();
    expect(body).not.toContain(persona.name);
    expect(body).not.toContain(persona.username);
    expect(await anonymous.content()).not.toContain(persona.username);

    // Disable share: old link shows the neutral page.
    await page.getByRole("button", { name: "Зупинити доступ" }).click();
    await expect(page.getByText("Доступ за посиланням вимкнено.")).toBeVisible();
    const fresh = await browser.newContext({ baseURL });
    const freshPage = await fresh.newPage();
    const revoked = await freshPage.goto(shareUrl);
    expect(revoked?.status()).toBe(404);
    await expect(freshPage.getByRole("heading", { name: "Посилання недоступне" })).toBeVisible();
    expect(await freshPage.locator("body").innerText()).not.toContain(title);
    await fresh.close();

    // Another teacher cannot open this plan.
    const foreign = await otherTeacher.page.goto(`/plans/${planId}`);
    expect(foreign?.status()).toBe(404);
  });

  test("teacher cannot see or open progress", async ({ teacher }) => {
    const { page } = teacher;
    await page.goto("/plans");
    await expect(page.getByRole("link", { name: "Прогрес" })).toHaveCount(0);
    const res = await page.goto("/progress");
    expect(res?.status()).toBe(404);
    const api = await page.request.get("/api/progress/cohorts");
    expect(api.status()).toBe(404);
  });
});

test.describe("access and language", () => {
  test("signed-out user is redirected to login", async ({ anonymous }) => {
    await anonymous.goto("/plans");
    await expect(anonymous).toHaveURL(/\/login\?next=%2Fplans/);
    await anonymous.goto("/progress");
    await expect(anonymous).toHaveURL(/\/login/);
  });

  test("locale switch to ru changes the UI text", async ({ anonymous }) => {
    await anonymous.goto("/login");
    await expect(anonymous.getByRole("heading", { name: "Вхід до YWS Lab" })).toBeVisible();
    await anonymous.locator('button[value="ru"]').click();
    await expect(anonymous.getByRole("heading", { name: "Вход в YWS Lab" })).toBeVisible();
  });
});

test.describe("methodologist: student progress", () => {
  test("cohort, modules, student, assessments, dynamics and overview", async ({ methodologist }) => {
    const { page } = methodologist;
    const cohortName = `E2E потік ${uid()}`;
    const studentName = `Студент ${uid()}`;

    // Cohort.
    await page.goto("/progress?list=1");
    await page.getByRole("textbox", { name: "Назва потоку" }).fill(cohortName);
    await page.getByRole("button", { name: "Створити потік" }).click();
    await expect(page).toHaveURL(/\/progress\/cohorts\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(cohortName);
    const cohortUrl = new URL(page.url()).pathname;

    // Modules 1-5.
    await page.getByRole("link", { name: "Керувати модулями" }).click();
    for (let n = 1; n <= 5; n++) await page.getByLabel(`Модуль ${n}`, { exact: true }).check();
    await page.getByRole("button", { name: "Додати обрані (5)" }).click();
    await expect(page.getByText("Модулі оновлено.")).toBeVisible();
    await page.goto(cohortUrl);
    const stages = page.getByRole("list", { name: "Етапи потоку" });
    for (const label of ["Точка 0", "Модуль 1", "Модуль 5", "Фінал"]) await expect(stages.getByText(label, { exact: true })).toBeVisible();

    // Student with a starting profile.
    await page.getByRole("link", { name: "Додати студента" }).first().click();
    await page.getByRole("button", { name: "Створити нового студента" }).click();
    await page.locator("input[required]").fill(studentName);
    await page.getByRole("radio", { name: /Огранка/ }).check();
    await page.getByRole("button", { name: "Додати до потоку" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(studentName);
    const studentUrl = new URL(page.url()).pathname;

    const fillAndSave = async (stageLink: RegExp, first: number, rest: number) => {
      await page.goto(studentUrl);
      await page.getByRole("navigation", { name: "Оцінити етап" }).getByRole("link", { name: stageLink }).click();
      const numbers = page.locator('input[inputmode="numeric"]');
      await expect(numbers).toHaveCount(16);
      await numbers.nth(0).fill(String(first));
      for (let i = 1; i < 16; i++) await numbers.nth(i).fill(String(rest));
      await page.getByRole("button", { name: "Зберегти", exact: true }).click();
      await expect(page.getByText("Збережено.")).toBeVisible();
    };

    // Point 0 (first score is a real zero), then Module 1.
    await fillAndSave(/^Точка 0/, 0, 3);
    await page.reload();
    await expect(page.locator('input[inputmode="numeric"]').nth(0)).toHaveValue("0");
    await fillAndSave(/^Модуль 1/, 1, 5);

    // Student page: skill bars with signed changes, history, dynamics label.
    await page.goto(studentUrl);
    await expect(page.getByText("+1 від точки 0").first()).toBeVisible();
    await expect(page.getByText("+2 від точки 0").first()).toBeVisible();
    await expect(page.getByRole("img", { name: /Володіння мовою та голосом: 1\/10/ })).toBeVisible();
    await expect(page.getByText("Динаміка:", { exact: true })).toBeVisible();
    await expect(page.getByText(/Різке зростання|Стійке зростання|Стагнація|Зона уваги/).first()).toBeVisible();
    const row = page.getByRole("row", { name: /Володіння мовою та голосом/ }).first();
    await expect(row.getByRole("cell").first()).toHaveText("0");

    // Overview card.
    await page.goto(cohortUrl);
    const card = page.getByRole("article", { name: studentName });
    await expect(card).toBeVisible();
    await expect(card.getByText(/Модуль 1/).first()).toBeVisible();
    await expect(card.getByText(/Різке зростання|Стійке зростання|Стагнація|Зона уваги/)).toBeVisible();
    await expect(card.getByText("Базові")).toBeVisible();
  });
});
