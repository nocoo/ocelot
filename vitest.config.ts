import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    allowOnly: false,
    passWithNoTests: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}", "worker/**/*.ts", "scripts/release-model.ts"],
      exclude: [
        "src/views/**",
        "src/main.tsx",
        // Local dev/test synthetic GitHub double — never imported in production
        "mock/**",
        "**/*.d.ts",
      ],
      reporter: ["text", "html", "json", "json-summary"],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
    projects: [
      { test: { name: "models", environment: "node", include: ["tests/unit/**/*.test.ts"] } },
      {
        plugins: [
          cloudflareTest(async () => ({
            wrangler: { configPath: "./wrangler.local.jsonc" },
            miniflare: { bindings: { TEST_MIGRATIONS: await readD1Migrations("./migrations") } },
          })),
        ],
        test: {
          name: "worker",
          include: ["tests/worker/**/*.test.ts"],
          setupFiles: ["tests/worker/setup.ts"],
          fileParallelism: false,
          testTimeout: 15_000,
        },
      },
    ],
  },
});
