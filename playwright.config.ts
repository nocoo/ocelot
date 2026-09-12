import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 8000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:27049",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "webkit-mobile",
      testMatch: "**/mobile-navigation.spec.ts",
      // Playwright exposes native swipe injection only in Chromium; WebKit covers taps and keyboard scroll.
      grepInvert: /native touch/u,
      use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: "bun run build && bun run dev --test",
    url: "http://127.0.0.1:27049/api/session",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
