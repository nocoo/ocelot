import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    allowOnly: false,
    passWithNoTests: false,
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}", "scripts/release-model.ts"],
      exclude: [
        "src/views/**",
        "src/main.tsx",
        // Local dev/test synthetic GitHub double — never imported in production
        "mock/**",
        "**/*.d.ts",
      ],
      reporter: ["text", "html", "json", "json-summary"],
      thresholds: { statements: 90, lines: 90, functions: 90, branches: 85 },
    },
  },
});
