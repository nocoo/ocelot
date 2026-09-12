import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertDeploymentTag,
  assertWorkflowSuccess,
  chooseVersion,
  deploymentVersion,
  parseVersion,
  releaseNotes,
  releaseOptions,
  updateChangelog,
  verifyAccessDomain,
  type WorkflowEvidence,
} from "../../scripts/release-model";

vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn().mockResolvedValue(undefined) }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(pause).mockClear();
});

describe("nmem release policy", () => {
  const now = Date.parse("2026-09-11T12:00:00Z");
  const baseline = {
    current: "1.2.3",
    previous: { version: "1.2.3", releasedAt: now },
    changedLines: 0,
    now,
  };
  it("parses strict versions and command options", () => {
    expect(parseVersion("0.12.30")).toEqual([0, 12, 30]);
    expect(releaseOptions([])).toEqual({ requested: undefined, dryRun: false });
    expect(releaseOptions(["--", "minor", "--dry-run"])).toEqual({
      requested: "minor",
      dryRun: true,
    });
    expect(releaseOptions(["2.0.0"])).toEqual({ requested: "2.0.0", dryRun: false });
    for (const value of [
      "v1.2.3",
      "1.2",
      "1.2.3-beta",
      "01.2.3",
      "-1.2.3",
      "1.2.9007199254740992",
      "--unknown",
    ])
      expect(() => parseVersion(value)).toThrow();
    expect(() => releaseOptions(["patch", "minor"])).toThrow();
    expect(() => releaseOptions(["--unknown"])).toThrow();
  });
  it("uses patch by default and minor only beyond the age or line thresholds", () => {
    expect(chooseVersion(baseline)).toBe("1.2.4");
    expect(chooseVersion({ ...baseline, changedLines: 500, now: now + 3 * 86400_000 })).toBe(
      "1.2.4",
    );
    expect(chooseVersion({ ...baseline, changedLines: 501 })).toBe("1.3.0");
    expect(chooseVersion({ ...baseline, now: now + 3 * 86400_000 + 1 })).toBe("1.3.0");
    expect(chooseVersion({ ...baseline, requested: "patch", changedLines: 800 })).toBe("1.2.4");
    expect(chooseVersion({ ...baseline, requested: "minor" })).toBe("1.3.0");
    expect(chooseVersion({ ...baseline, requested: "major" })).toBe("2.0.0");
    expect(chooseVersion({ ...baseline, requested: "3.1.4" })).toBe("3.1.4");
    expect(chooseVersion({ ...baseline, requested: "1.2.3" })).toBe("1.2.3");
    expect(chooseVersion({ ...baseline, previous: null })).toBe("1.2.3");
    expect(chooseVersion({ ...baseline, previous: null, requested: "patch" })).toBe("1.2.4");
    expect(chooseVersion({ ...baseline, current: "1.3.0" })).toBe("1.3.0");
    expect(chooseVersion({ ...baseline, requested: "1.10.0" })).toBe("1.10.0");
    for (const requested of ["0.9.9", "1.1.9", "1.2.2"])
      expect(() => chooseVersion({ ...baseline, requested })).toThrow(/lower/);
    expect(() => chooseVersion({ ...baseline, current: "1.1.0" })).toThrow(/behind/);
    expect(() =>
      chooseVersion({
        ...baseline,
        previous: null,
        current: "0.0.9007199254740991",
        requested: "patch",
      }),
    ).toThrow(/safe integers/);
  });
  it("groups commit notes, links the correct repository and replaces retry sections", () => {
    const notes = releaseNotes([
      { hash: "a".repeat(40), subject: "feat(reader): 中文阅读" },
      { hash: "b".repeat(40), subject: "feat: Profile" },
      { hash: "c".repeat(40), subject: "fix(auth)!: Verify owner" },
      { hash: "d".repeat(40), subject: "docs: Release guide" },
      { hash: "e".repeat(40), subject: "test: CI checks" },
      { hash: "f".repeat(40), subject: "chore: release v1.2.3" },
      { hash: "1".repeat(40), subject: "Maintenance without a prefix" },
    ]);
    expect(notes.match(/### Features/gu)).toHaveLength(1);
    for (const heading of ["Fixes", "Documentation", "Tests", "Maintenance"])
      expect(notes).toContain(`### ${heading}`);
    expect(notes).toContain(`https://github.com/nocoo/ocelot/commit/${"a".repeat(40)}`);
    expect(notes).not.toContain("chore: release");
    expect(releaseNotes([])).toBe("- Initial release.");
    const empty = updateChangelog("", "1.2.3", "2026-09-11", notes);
    expect(empty.startsWith("# Changelog\n\n## [1.2.3]")).toBe(true);
    const existing =
      "# Changelog\n\n## [Unreleased]\n\nPending\n\n## [1.2.3] - old\n\nOld\n\n## [1.2.2] - old\n\nKeep\n";
    const next = updateChangelog(existing, "1.2.3", "2026-09-11", notes);
    expect(next.match(/## \[1.2.3\]/gu)).toHaveLength(1);
    expect(next).toContain("## [1.2.2]");
    expect(next).not.toContain("Pending");
    expect(next).not.toContain("Old");
  });
  it("requires 100 percent of traffic and the exact version plus revision", () => {
    const id = "12345678-1234-1234-1234-123456789abc";
    expect(deploymentVersion({ versions: [{ version_id: id, percentage: 100 }] })).toBe(id);
    for (const value of [
      null,
      {},
      { versions: "bad" },
      { versions: [] },
      { versions: [null] },
      { versions: [{ percentage: 50, version_id: id }] },
      { versions: [{ percentage: 100 }] },
      { versions: [{ percentage: 100, version_id: "--bad" }] },
      {
        versions: [
          { percentage: 100, version_id: id },
          { percentage: 0, version_id: id },
        ],
      },
    ])
      expect(() => deploymentVersion(value)).toThrow();
    const tag = `v1.2.3-${"a".repeat(40)}`;
    expect(() => assertDeploymentTag({ annotations: { "workers/tag": tag } }, tag)).not.toThrow();
    for (const value of [null, {}, { annotations: {} }, { annotations: { "workers/tag": "old" } }])
      expect(() => assertDeploymentTag(value, tag)).toThrow();
  });
  it("requires the matching push CI and a successful deployment explicitly linked to that CI run", () => {
    const revision = "a".repeat(40);
    const workflow: WorkflowEvidence = {
      headSha: revision,
      status: "completed",
      conclusion: "success",
      event: "push",
      displayTitle: "CI",
      url: "https://example.test/ci",
      jobs: [],
    };
    expect(() => assertWorkflowSuccess(workflow, revision)).not.toThrow();
    for (const patch of [
      { headSha: "old" },
      { status: "in_progress" },
      { conclusion: "failure" },
      { event: "pull_request" },
    ])
      expect(() => assertWorkflowSuccess({ ...workflow, ...patch }, revision)).toThrow();
    const job = {
      name: "Deploy / Deploy Worker",
      conclusion: "success",
      steps: [{ name: "Run project deploy script", conclusion: "success" }],
    };
    const deployment = {
      ...workflow,
      event: "workflow_run",
      displayTitle: "Deploy CI 42",
      jobs: [job],
    };
    expect(() => assertWorkflowSuccess(deployment, revision, 42)).not.toThrow();
    expect(() =>
      assertWorkflowSuccess({ ...deployment, event: "workflow_dispatch" }, revision, 42),
    ).not.toThrow();
    for (const patch of [
      { displayTitle: "Deploy CI 41" },
      { event: "push" },
      { jobs: [] },
      { jobs: [{ ...job, name: "Deploy" }] },
      { jobs: [{ ...job, conclusion: "skipped" }] },
      { jobs: [{ ...job, steps: [] }] },
      { jobs: [{ ...job, steps: [{ name: "Build", conclusion: "success" }] }] },
      { jobs: [{ ...job, steps: [{ name: "Run project deploy script", conclusion: "failure" }] }] },
    ])
      expect(() => assertWorkflowSuccess({ ...deployment, ...patch }, revision, 42)).toThrow();
  });
  it("waits for initial DNS and edge readiness before accepting the Access login", async () => {
    const outgoing = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("ENOTFOUND"))
      .mockResolvedValueOnce(new Response("Not ready", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: "https://nocoo.cloudflareaccess.com/cdn-cgi/access/login" },
        }),
      );
    await verifyAccessDomain();
    expect(outgoing).toHaveBeenCalledTimes(3);
    expect(outgoing).toHaveBeenLastCalledWith("https://ocelot.hexly.ai/", {
      redirect: "manual",
      signal: expect.any(AbortSignal),
    });
    expect(pause).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledWith(10_000);
  });
  it("fails closed on unexpected responses and limits retries for unreachable domains", async () => {
    const outgoing = vi.spyOn(globalThis, "fetch");
    for (const [status, location] of [
      [200, ""],
      [401, ""],
      [302, "https://another.cloudflareaccess.com/cdn-cgi/access/login"],
      [302, "https://nocoo.cloudflareaccess.com/unexpected"],
    ] as const) {
      outgoing
        .mockClear()
        .mockResolvedValue(
          new Response(null, { status, headers: location ? { Location: location } : {} }),
        );
      await expect(verifyAccessDomain()).rejects.toThrow(/must redirect/);
      expect(outgoing).toHaveBeenCalledTimes(1);
      expect(pause).not.toHaveBeenCalled();
    }
    outgoing.mockClear().mockImplementation(async () => new Response(null, { status: 503 }));
    await expect(verifyAccessDomain()).rejects.toThrow(/must redirect/);
    expect(outgoing).toHaveBeenCalledTimes(12);
    expect(pause).toHaveBeenCalledTimes(11);
    vi.mocked(pause).mockClear();
    outgoing.mockClear().mockRejectedValue(new TypeError("ENOTFOUND"));
    await expect(verifyAccessDomain()).rejects.toThrow("ENOTFOUND");
    expect(outgoing).toHaveBeenCalledTimes(12);
    expect(pause).toHaveBeenCalledTimes(11);
  });
});

describe("release CLI preflight and read-only preview", () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0))
      rmSync(directory, { recursive: true, force: true });
  });
  function fixture() {
    const cwd = mkdtempSync(join(tmpdir(), "ocelot-release-test-"));
    directories.push(cwd);
    const cleanEnv = { ...process.env };
    for (const key of Object.keys(cleanEnv)) {
      if (
        key.startsWith("GIT_") ||
        ["GH_TOKEN", "GITHUB_TOKEN", "CLOUDFLARE_API_TOKEN"].includes(key)
      )
        delete cleanEnv[key];
    }
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd, env: cleanEnv, encoding: "utf8" }).trim();
    git("init", "-b", "main");
    git("config", "user.name", "Release test");
    git("config", "user.email", "release@example.test");
    git("config", "commit.gpgsign", "false");
    git("config", "core.hooksPath", join(cwd, "no-hooks"));
    git("remote", "add", "origin", "https://github.com/nocoo/ocelot.git");
    mkdirSync(join(cwd, "scripts"));
    for (const file of ["release.ts", "release-model.ts"])
      cpSync(resolve("scripts", file), join(cwd, "scripts", file));
    writeFileSync(join(cwd, "package.json"), '{"type":"module","version":"0.1.0"}\n');
    writeFileSync(join(cwd, "CHANGELOG.md"), "# Changelog\n");
    git("add", ".");
    git("commit", "-m", "feat: Initial reading room");
    const bin = mkdtempSync(join(tmpdir(), "ocelot-release-bin-"));
    directories.push(bin);
    const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
    writeFileSync(
      join(bin, "git"),
      `#!/bin/sh\ncase "$1" in fetch|push) exit 98;; esac\nexec ${quote(realGit)} "$@"\n`,
      { mode: 0o755 },
    );
    writeFileSync(join(bin, "gh"), "#!/bin/sh\nexit 99\n", { mode: 0o755 });
    const cli = (...args: string[]) =>
      spawnSync(process.execPath, [join(cwd, "scripts/release.ts"), ...args], {
        cwd,
        encoding: "utf8",
        env: { ...cleanEnv, PATH: `${bin}:${process.env.PATH}` },
      });
    return { cwd, git, cli, bin, cleanEnv, realGit };
  }
  function publication(mode = "success") {
    const target = fixture();
    const { cwd, git, bin, realGit, cleanEnv } = target;
    const log = join(bin, "publication.jsonl");
    const notes = join(bin, "notes.md");
    writeFileSync(join(cwd, "bun.lock"), "{}\n");
    git("add", "bun.lock");
    git("commit", "-m", "chore: lock dependencies");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    cleanEnv.OCELOT_RELEASE_TEST_MODE = mode;
    writeFileSync(
      join(bin, "git"),
      `#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(["git", ...args]) + "\\n");
if (["fetch", "push"].includes(args[0])) process.exit(0);
const result = spawnSync(${JSON.stringify(realGit)}, args, { stdio: "inherit" });
process.exit(result.status ?? 1);
`,
      { mode: 0o755 },
    );
    writeFileSync(join(bin, "bun"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    writeFileSync(
      join(bin, "gh"),
      `#!/usr/bin/env node
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(["gh", ...args]) + "\\n");
const mode = process.env.OCELOT_RELEASE_TEST_MODE;
const revision = execFileSync(${JSON.stringify(realGit)}, ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const output = value => process.stdout.write(JSON.stringify(value));
if (args[0] === "auth") process.exit(0);
if (args[0] === "run" && args[1] === "list") {
  output(args.includes("verify.yml") ? [{ databaseId: 11 }] : [
    { databaseId: 99, displayTitle: "Deploy CI 10" },
    { databaseId: 22, displayTitle: "Deploy CI 11" }
  ]);
} else if (args[0] === "run" && args[1] === "watch") {
  if ((args[2] === "11" && mode === "ci-failure") || (args[2] === "22" && mode === "deploy-failure")) process.exit(1);
} else if (args[0] === "run" && args[1] === "view") {
  const deploy = args[2] === "22";
  output({ headSha: mode === "wrong-sha" ? "bad" : revision, status: "completed", conclusion: "success",
    event: deploy ? "workflow_run" : "push",
    displayTitle: deploy ? (mode === "wrong-source" ? "Deploy CI 10" : "Deploy CI 11") : "CI",
    url: "https://github.com/nocoo/ocelot/actions/runs/" + args[2],
    jobs: deploy ? [{ name: "Deploy / Deploy Worker", conclusion: "success", steps: [
      { name: "Run project deploy script", conclusion: mode === "skipped-deploy" ? "skipped" : "success" }
    ] }] : [] });
} else if (args[0] === "api") {
  process.stdout.write(mode === "main-moved" ? "f".repeat(40) : revision);
} else if (args[0] === "release" && args[1] === "create") {
  fs.writeFileSync(${JSON.stringify(notes)}, fs.readFileSync(args[args.indexOf("--notes-file") + 1]));
} else process.exit(99);
`,
      { mode: 0o755 },
    );
    return {
      ...target,
      notes,
      commands: () =>
        readFileSync(log, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line) as string[]),
    };
  }
  it("publishes only after independent matching CI/CD and records both evidence URLs", () => {
    const { cli, git, commands, notes } = publication();
    const result = cli("minor");
    expect(result.status, result.stderr).toBe(0);
    expect(git("tag", "--list")).toBe("v0.2.0");
    expect(git("rev-parse", "v0.2.0^{}")).toBe(git("rev-parse", "HEAD"));
    expect(git("cat-file", "-t", "v0.2.0")).toBe("tag");
    const calls = commands();
    const deployment = calls.findIndex(
      (call) => call[0] === "gh" && call[1] === "run" && call[2] === "watch" && call[3] === "22",
    );
    const tag = calls.findIndex(
      (call) => call[0] === "git" && call[1] === "tag" && call[2] === "-a",
    );
    expect(tag).toBeGreaterThan(deployment);
    expect(calls.some((call) => call[1] === "run" && call[2] === "watch" && call[3] === "99")).toBe(
      false,
    );
    const body = readFileSync(notes, "utf8");
    expect(body).toContain("[Verified CI](https://github.com/nocoo/ocelot/actions/runs/11)");
    expect(body).toContain(
      "[Verified production deployment](https://github.com/nocoo/ocelot/actions/runs/22)",
    );
  });
  it.each([
    "ci-failure",
    "deploy-failure",
    "wrong-sha",
    "wrong-source",
    "skipped-deploy",
    "main-moved",
  ])("does not create a tag or Release after %s", (mode) => {
    const { cli, git, commands } = publication(mode);
    expect(cli("minor").status).not.toBe(0);
    expect(git("tag", "--list")).toBe("");
    expect(commands().some((call) => call[0] === "gh" && call[1] === "release")).toBe(false);
    expect(git("status", "--porcelain")).toBe("");
  });
  it("retries an untagged version after deployment recovery without another version increment", () => {
    const { cli, git, cwd, cleanEnv } = publication("deploy-failure");
    expect(cli("minor").status).not.toBe(0);
    expect(JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")).version).toBe("0.2.0");
    cleanEnv.OCELOT_RELEASE_TEST_MODE = "success";
    const result = cli("0.2.0");
    expect(result.status, result.stderr).toBe(0);
    expect(git("tag", "--list")).toBe("v0.2.0");
    expect(git("log", "--format=%s").match(/chore: release v0.2.0/gu)).toHaveLength(1);
  });
  it("previews a fresh repository without changing files or refs or calling remote commands", () => {
    const { cwd, git, cli } = fixture();
    const before = git("show-ref");
    const manifest = readFileSync(join(cwd, "package.json"), "utf8");
    const result = cli("--", "--dry-run");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Release 0.1.0 → 0.1.0");
    expect(result.stdout).toContain("Initial reading room");
    expect(git("status", "--porcelain")).toBe("");
    expect(git("show-ref")).toBe(before);
    expect(readFileSync(join(cwd, "package.json"), "utf8")).toBe(manifest);
  });
  it("rejects dirty worktrees, the wrong branch or origin, and existing tags before publication", () => {
    const { cwd, git, cli } = fixture();
    writeFileSync(join(cwd, "uncommitted"), "Work in progress");
    expect(cli("--dry-run").stderr).toContain("Commit the working tree");
    rmSync(join(cwd, "uncommitted"));
    git("switch", "-c", "feature");
    expect(cli("--dry-run").stderr).toContain("Release from main");
    git("switch", "main");
    git("remote", "set-url", "origin", "https://github.com/other/other.git");
    expect(cli("--dry-run").stderr).toContain("origin must be nocoo/ocelot");
    git("remote", "set-url", "origin", "https://github.com/nocoo/ocelot.git");
    git("tag", "v0.1.0");
    expect(cli("0.1.0", "--dry-run").stderr).toContain("already exists");
    expect(cli("--dry-run").stdout).toContain("Release 0.1.0 → 0.1.1");
  });
  it("inspects storage, migrates before deployment, verifies the revision and stops on failures", () => {
    const { cwd, git, bin, cleanEnv } = fixture();
    cpSync(resolve("scripts/deploy.ts"), join(cwd, "scripts/deploy.ts"));
    const config = { vars: { OWNER_EMAIL: "reader@example.test" }, account_id: "test-account" };
    writeFileSync(join(cwd, "wrangler.jsonc"), JSON.stringify(config));
    writeFileSync(join(cwd, "resources.json"), "[]");
    writeFileSync(
      join(bin, "bun"),
      `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync("commands.log", JSON.stringify(args) + "\\n");
if (args.join(" ") === "x wrangler d1 list --json") process.stdout.write(fs.readFileSync("resources.json", "utf8"));
if (args.includes("apply") && process.env.OCELOT_TEST_FAIL === "migrate") process.exit(5);
`,
      { mode: 0o755 },
    );
    const bun = execFileSync("which", ["bun"], { encoding: "utf8" }).trim();
    const deploy = (extra: Record<string, string> = {}) => {
      writeFileSync(join(cwd, "commands.log"), "");
      const result = spawnSync(bun, [join(cwd, "scripts/deploy.ts")], {
        cwd,
        encoding: "utf8",
        env: { ...cleanEnv, PATH: `${bin}:${process.env.PATH}`, ...extra },
      });
      const commands: string[][] = readFileSync(join(cwd, "commands.log"), "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      return { ...result, commands };
    };
    const revision = git("rev-parse", "HEAD");
    const initial = deploy();
    expect(initial.status, initial.stderr).toBe(0);
    expect(initial.commands).toEqual([
      ["x", "wrangler", "d1", "list", "--json"],
      ["x", "wrangler", "d1", "create", "ocelot", "--location", "apac", "--update-config=false"],
      ["x", "wrangler", "d1", "migrations", "apply", "ocelot", "--remote"],
      [
        "x",
        "wrangler",
        "deploy",
        "--tag",
        `v0.1.0-${revision}`,
        "--message",
        `Ocelot v0.1.0 (${revision})`,
      ],
      ["scripts/verify-deployment.ts", revision],
    ]);
    writeFileSync(join(cwd, "resources.json"), '[{"name":"ocelot"},{"name":"another-app"}]');
    const existing = deploy();
    expect(existing.status).toBe(0);
    expect(existing.commands.some((args) => args.includes("create"))).toBe(false);
    const failed = deploy({ OCELOT_TEST_FAIL: "migrate" });
    expect(failed.status).not.toBe(0);
    expect(failed.commands).toHaveLength(2);
    expect(deploy({ CLOUDFLARE_ACCOUNT_ID: "wrong-account" }).commands).toEqual([]);
    config.vars.OWNER_EMAIL = "unconfigured";
    writeFileSync(join(cwd, "wrangler.jsonc"), JSON.stringify(config));
    const unconfigured = deploy();
    expect(unconfigured.status).not.toBe(0);
    expect(unconfigured.commands).toEqual([]);
  });
});
