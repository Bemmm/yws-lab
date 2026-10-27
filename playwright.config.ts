import { defineConfig } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

/** Telegram ids the web server treats as methodologists (the e2e fixture signs in as the first one). */
export const METHODOLOGIST_IDS = ["9100000001", "9100000002"];

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://yws:yws@localhost:5432/yws";

const viewports = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "mobile-375", width: 375, height: 812 },
];

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results/artifacts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["github"], ["html", { open: "never", outputFolder: "playwright-report" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    locale: "uk-UA",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: viewports.map((v) => ({
    name: v.name,
    use: { browserName: "chromium" as const, viewport: { width: v.width, height: v.height } },
    // Full user journeys run once (desktop); accessibility + screenshots run at every viewport.
    testMatch: v.name === "desktop-1440" ? /.*\.spec\.ts/ : /a11y\.spec\.ts/,
  })),
  webServer: {
    command: "npm run build && npm run start",
    url: `${BASE_URL}/api/health`,
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: "pipe",
    env: {
      PORT: String(PORT),
      DATABASE_URL,
      APP_URL: BASE_URL,
      METHODOLOGIST_TELEGRAM_IDS: METHODOLOGIST_IDS.join(","),
      SESSION_SECRET: "e2e-session-secret-not-used",
    },
  },
});
