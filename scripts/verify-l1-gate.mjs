#!/usr/bin/env bun
/**
 * Isolated probes for `.husky/pre-commit` (index-snapshot L1).
 * Uses temporary git repos under TMPDIR; does not mutate the real index.
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const here = import.meta.dirname;
const repo = join(here, "..");
const owned = mkdtempSync(join(tmpdir(), "ocelot-l1-gate-"));
let failed = 0;

const fixtureSource = `export function gateReady(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
`;
const passingTest = `import { expect, it } from "vitest";
import { gateReady } from "../src/gate-fixture";

it("accepts trimmed text", () => {
  expect(gateReady("a")).toBe(true);
  expect(gateReady("  ")).toBe(false);
});
`;
const failingTest = passingTest.replace("toBe(true)", "toBe(false)");

const minimalTsconfig = `{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src/**/*.ts"]
}
`;

const minimalVitest = `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/gate-fixture.test.ts"],
    coverage: {
      provider: "istanbul",
      include: ["src/gate-fixture.ts", "src/gate-gap.ts"],
      reporter: ["text", "json-summary"],
      thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
    },
  },
});
`;

function check(name, ok, detail = "") {
  const text = ok
    ? detail.replace(/\s+/g, " ").slice(0, 320)
    : detail.trim().replace(/\s+/g, " ").slice(0, 480);
  console.log(`${ok ? "ok" : "FAIL"} ${name}${text ? `: ${text}` : ""}`);
  if (!ok) failed = 1;
}

function rootIndex() {
  return execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: repo, encoding: "utf8" });
}

const indexBefore = rootIndex();

function scratchOf(dir) {
  const scratch = join(dir, ".tmp");
  mkdirSync(scratch, { recursive: true });
  return scratch;
}

function resultOf(scratch, result) {
  return {
    status: result.status,
    signal: result.signal,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    leftovers: existsSync(scratch) ? readdir(scratch) : ["missing"],
  };
}

function readdir(dir) {
  return execFileSync("ls", ["-A", dir], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
}

function snapshotGone(leftovers) {
  return leftovers.every((name) => !name.startsWith("ocelot-index-"));
}

function fixture(name, extra = {}) {
  const dir = join(owned, name);
  for (const part of ["src", "tests", ".husky"]) mkdirSync(join(dir, part), { recursive: true });

  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "l1-gate@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "l1-gate"], { cwd: dir });

  writeFileSync(join(dir, ".gitignore"), "node_modules\ncoverage\n.tmp\n.cache\n");
  writeFileSync(join(dir, "package.json"), readFileSync(join(repo, "package.json"), "utf8"));
  writeFileSync(join(dir, "bun.lock"), readFileSync(join(repo, "bun.lock"), "utf8"));
  writeFileSync(join(dir, "vitest.config.ts"), extra.vitest ?? minimalVitest);
  writeFileSync(join(dir, "tsconfig.json"), extra.tsconfig ?? minimalTsconfig);
  writeFileSync(join(dir, "biome.json"), readFileSync(join(repo, "biome.json"), "utf8"));
  writeFileSync(
    join(dir, ".husky/pre-commit"),
    readFileSync(join(repo, ".husky/pre-commit"), "utf8"),
  );
  chmodSync(join(dir, ".husky/pre-commit"), 0o755);

  writeFileSync(join(dir, "src/gate-fixture.ts"), fixtureSource);
  if (!extra.skipTest) {
    writeFileSync(join(dir, "tests/gate-fixture.test.ts"), extra.test ?? passingTest);
  }
  if (extra.badLint) writeFileSync(join(dir, "src/gate-lint.ts"), extra.badLint);
  if (extra.uncovered) writeFileSync(join(dir, "src/gate-gap.ts"), extra.uncovered);
  if (extra.badTypes) writeFileSync(join(dir, "src/gate-types.ts"), extra.badTypes);

  symlinkSync(join(repo, "node_modules"), join(dir, "node_modules"));

  const paths = [
    ".gitignore",
    "package.json",
    "bun.lock",
    "vitest.config.ts",
    "tsconfig.json",
    "biome.json",
    "tests/gate-fixture.test.ts",
    "src/gate-fixture.ts",
    ".husky/pre-commit",
  ].filter((p) => existsSync(join(dir, p)));

  if (extra.badLint) paths.push("src/gate-lint.ts");
  if (extra.uncovered) paths.push("src/gate-gap.ts");
  if (extra.badTypes) paths.push("src/gate-types.ts");

  execFileSync("git", ["add", "--", ...paths], { cwd: dir });

  if (extra.worktreeTypes) writeFileSync(join(dir, "src/gate-types.ts"), extra.worktreeTypes);
  if (extra.worktreeTest)
    writeFileSync(join(dir, "tests/gate-fixture.test.ts"), extra.worktreeTest);

  return dir;
}

function runHook(dir, { env = {}, timeout } = {}) {
  const scratch = scratchOf(dir);
  return resultOf(
    scratch,
    spawnSync("sh", [".husky/pre-commit"], {
      cwd: dir,
      env: { ...process.env, TMPDIR: scratch, ...env },
      encoding: "utf8",
      timeout,
    }),
  );
}

try {
  const healthyDir = fixture("healthy");
  const healthy = runHook(healthyDir);
  check("healthy index snapshot exits 0", healthy.status === 0, healthy.output);
  check(
    "healthy removes snapshot temp dir",
    snapshotGone(healthy.leftovers),
    healthy.leftovers.join(","),
  );

  const typeDir = fixture("typecheck-staged", {
    badTypes: `export const broken: number = "nope";\n`,
    worktreeTypes: `export const broken = 1;\n`,
  });
  const typecheck = runHook(typeDir);
  check(
    "staged type error rejects while worktree is clean",
    typecheck.status !== 0 && /error TS|Type/i.test(typecheck.output),
    typecheck.output,
  );
  check(
    "type probe leaves unstaged worktree fix",
    readFileSync(join(typeDir, "src/gate-types.ts"), "utf8").includes("broken = 1"),
  );
  check(
    "type probe keeps failing staged index",
    execFileSync("git", ["show", ":src/gate-types.ts"], {
      cwd: typeDir,
      encoding: "utf8",
    }).includes('"nope"'),
  );

  const utDir = fixture("ut-fail", { test: failingTest, worktreeTest: passingTest });
  const ut = runHook(utDir);
  check(
    "staged unit test failure rejects",
    ut.status !== 0 && /AssertionError|expected false|FAIL/i.test(ut.output),
    ut.output,
  );

  const gapBody = `export function gateGap(): number {
  if (Math.random() > 2) return 1;
  return 0;
}
`;
  const coverageDir = fixture("coverage-low", { uncovered: gapBody });
  const coverage = runHook(coverageDir);
  check(
    "coverage below floor rejects",
    coverage.status !== 0 && /threshold|Coverage/i.test(coverage.output),
    coverage.output,
  );

  const lintDir = fixture("lint-error", {
    badLint: `export function gateLint(): void {
  const value: any = 1;
  void value;
}
`,
  });
  const lint = runHook(lintDir);
  check(
    "biome error rejects",
    lint.status !== 0 && /noExplicitAny|error|lint/i.test(lint.output),
    lint.output,
  );

  const missingBin = join(owned, "bin");
  mkdirSync(missingBin, { recursive: true });
  symlinkSync(
    execFileSync("command", ["-v", "git"], { encoding: "utf8", shell: true }).trim(),
    join(missingBin, "git"),
  );
  const missingDir = fixture("missing-bun");
  const missing = runHook(missingDir, { env: { PATH: `${missingBin}:/usr/bin:/bin` } });
  check(
    "missing bun rejects",
    missing.status !== 0 && /bun is required/i.test(missing.output),
    missing.output,
  );

  check("repository index untouched", rootIndex() === indexBefore);
} finally {
  rmSync(owned, { recursive: true, force: true });
}

if (failed) process.exit(failed);
console.log("L1 gate probes passed");
