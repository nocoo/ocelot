import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 3 : 2,
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
  ],
  webServer: {
    command:
      process.env.OCELOT_E2E_SKIP_BUILD === "1"
        ? "bun run dev --test"
        : "bun run build && bun run dev --test",
    url: "http://127.0.0.1:27049/api/session",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
