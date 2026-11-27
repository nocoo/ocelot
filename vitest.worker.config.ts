import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.local.jsonc" },
      miniflare: { bindings: { TEST_MIGRATIONS: await readD1Migrations("./migrations") } },
    })),
  ],
  test: {
    allowOnly: false,
    passWithNoTests: false,
    name: "worker",
    include: ["tests/worker/**/*.test.ts"],
    setupFiles: ["tests/worker/setup.ts"],
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
