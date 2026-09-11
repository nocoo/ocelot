import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "istanbul",
      include: ["src/**/*.{ts,tsx}", "worker/**/*.ts", "mock/**/*.ts", "scripts/release-model.ts"],
      exclude: ["src/views/**", "src/main.tsx", "**/*.d.ts"],
      reporter: ["text", "html", "json", "json-summary"],
      thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
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
