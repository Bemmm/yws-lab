import { test as base, expect, type Browser, type Page } from "@playwright/test";
import { methodologistIdentity, signInAs, teacherIdentity, type Persona } from "./db";

export type Session = { page: Page; persona: Persona };

async function open(browser: Browser, baseURL: string | undefined, viewport: { width: number; height: number } | null, who: Parameters<typeof signInAs>[1]): Promise<Session & { close: () => Promise<void> }> {
  const context = await browser.newContext({ baseURL, viewport, locale: "uk-UA" });
  const persona = await signInAs(context, who, baseURL);
  const page = await context.newPage();
  return { page, persona, close: () => context.close() };
}

export const test = base.extend<{ teacher: Session; otherTeacher: Session; methodologist: Session; anonymous: Page }>({
  teacher: async ({ browser, baseURL, viewport }, provide) => {
    const s = await open(browser, baseURL, viewport, teacherIdentity());
    await provide(s);
    await s.close();
  },
  otherTeacher: async ({ browser, baseURL, viewport }, provide) => {
    const s = await open(browser, baseURL, viewport, teacherIdentity());
    await provide(s);
    await s.close();
  },
  methodologist: async ({ browser, baseURL, viewport }, provide) => {
    const s = await open(browser, baseURL, viewport, methodologistIdentity());
    await provide(s);
    await s.close();
  },
  anonymous: async ({ browser, baseURL, viewport }, provide) => {
    const context = await browser.newContext({ baseURL, viewport, locale: "uk-UA" });
    await provide(await context.newPage());
    await context.close();
  },
});

export { expect };
