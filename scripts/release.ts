import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import {
  assertWorkflowSuccess,
  chooseVersion,
  releaseNotes,
  releaseOptions,
  updateChangelog,
  type WorkflowEvidence,
} from "./release-model.ts";

process.chdir(resolve(import.meta.dirname, ".."));
const repository = "nocoo/ocelot";
const options = releaseOptions(process.argv.slice(2));
function output(command: string, ...args: string[]): string {
  return execFileSync(command, args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }).trim();
}
async function run(command: string, ...args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} failed (${code}).`)),
    );
  });
}

if (output("git", "branch", "--show-current") !== "main") throw new Error("Release from main.");
if (output("git", "status", "--porcelain"))
  throw new Error("Commit the working tree before releasing or previewing a release.");
if (
  !/^(https:\/\/github\.com\/|git@github\.com:)nocoo\/ocelot(?:\.git)?$/u.test(
    output("git", "remote", "get-url", "origin"),
  )
)
  throw new Error("The origin must be nocoo/ocelot.");
if (!options.dryRun) {
  await run("gh", "auth", "status");
  await run("git", "fetch", "origin", "main", "--tags");
  await run("git", "merge-base", "--is-ancestor", "origin/main", "HEAD");
}

const manifest = JSON.parse(await readFile("package.json", "utf8"));
const tags = output("git", "tag", "--merged", "HEAD", "--sort=-version:refname")
  .split("\n")
  .filter((tag) => /^v\d+\.\d+\.\d+$/u.test(tag));
const previousTag = tags[0];
const previous = previousTag
  ? {
      version: previousTag.slice(1),
      releasedAt: Date.parse(
        output(
          "git",
          "for-each-ref",
          "--format=%(taggerdate:iso8601-strict)",
          `refs/tags/${previousTag}`,
        ) || output("git", "log", "-1", "--format=%cI", previousTag),
      ),
    }
  : null;
const changedLines = previousTag
  ? output("git", "diff", "--numstat", `${previousTag}..HEAD`)
      .split("\n")
      .reduce((total, line) => {
        const [added, removed] = line.split("\t");
        return total + (Number(added) || 0) + (Number(removed) || 0);
      }, 0)
  : 0;
const version = chooseVersion({
  current: manifest.version,
  requested: options.requested,
  previous,
  changedLines,
  now: Date.now(),
});
const tag = `v${version}`;
if (output("git", "tag", "--list", tag))
  throw new Error(`${tag} already exists; published tags are never overwritten.`);
const commits = output(
  "git",
  "log",
  "--reverse",
  "--format=%H%x09%s",
  previousTag ? `${previousTag}..HEAD` : "HEAD",
)
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [hash = "", ...subject] = line.split("\t");
    return { hash, subject: subject.join("\t") };
  });
const notes = releaseNotes(commits);
console.info(
  `Release ${manifest.version} → ${version}; ${commits.length} commits since ${previousTag ?? "repository creation"}.`,
);
if (options.dryRun) {
  console.info(`${notes}\n\nDry run: no files, refs, or remote resources changed.`);
  process.exit(0);
}

manifest.version = version;
await writeFile("package.json", `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(
  "CHANGELOG.md",
  updateChangelog(
    await readFile("CHANGELOG.md", "utf8"),
    version,
    new Date().toISOString().slice(0, 10),
    notes,
  ),
);
await run("bun", "install", "--lockfile-only", "--frozen-lockfile");
await run("git", "add", "--", "package.json", "bun.lock", "CHANGELOG.md");
if (output("git", "diff", "--cached", "--name-only"))
  await run("git", "commit", "-m", `chore: release ${tag}`);
const revision = output("git", "rev-parse", "HEAD");
await run("git", "push", "origin", "main");

let runId: number | undefined;
for (let attempt = 0; attempt < 18; attempt++) {
  const runs: { databaseId: number }[] = JSON.parse(
    output(
      "gh",
      "run",
      "list",
      "--repo",
      repository,
      "--workflow",
      "verify.yml",
      "--commit",
      revision,
      "--event",
      "push",
      "--json",
      "databaseId",
      "--limit",
      "1",
    ),
  );
  runId = runs[0]?.databaseId;
  if (runId) break;
  await pause(10_000);
}
if (!runId) throw new Error(`No CI run found for ${revision}. No tag was created.`);
await run(
  "gh",
  "run",
  "watch",
  String(runId),
  "--repo",
  repository,
  "--exit-status",
  "--interval",
  "10",
);
const evidence = (id: number): WorkflowEvidence =>
  JSON.parse(
    output(
      "gh",
      "run",
      "view",
      String(id),
      "--repo",
      repository,
      "--json",
      "headSha,status,conclusion,event,displayTitle,jobs,url",
    ),
  );
const workflow = evidence(runId);
assertWorkflowSuccess(workflow, revision);
let deploymentId: number | undefined;
for (let attempt = 0; attempt < 18; attempt++) {
  const runs: { databaseId: number; displayTitle: string }[] = JSON.parse(
    output(
      "gh",
      "run",
      "list",
      "--repo",
      repository,
      "--workflow",
      "release.yml",
      "--json",
      "databaseId,displayTitle",
      "--limit",
      "30",
    ),
  );
  deploymentId = runs.find((run) => run.displayTitle === `Deploy CI ${runId}`)?.databaseId;
  if (deploymentId) break;
  await pause(10_000);
}
if (!deploymentId) throw new Error(`No deployment found for CI ${runId}. No tag was created.`);
await run(
  "gh",
  "run",
  "watch",
  String(deploymentId),
  "--repo",
  repository,
  "--exit-status",
  "--interval",
  "10",
);
const deployment = evidence(deploymentId);
assertWorkflowSuccess(deployment, revision, runId);
if (output("gh", "api", `repos/${repository}/commits/main`, "--jq", ".sha") !== revision)
  throw new Error("main changed during this release. Review the newer deployment before tagging.");
await run("git", "tag", "-a", tag, revision, "-m", `Ocelot ${tag}`);
await run("git", "push", "origin", `refs/tags/${tag}`);
const temporary = await mkdtemp(join(tmpdir(), "ocelot-release-"));
try {
  const notesFile = join(temporary, "notes.md");
  await writeFile(
    notesFile,
    `${notes}\n\n[Verified CI](${workflow.url}) · [Verified production deployment](${deployment.url})\n`,
  );
  await run(
    "gh",
    "release",
    "create",
    tag,
    "--repo",
    repository,
    "--verify-tag",
    "--title",
    tag,
    "--notes-file",
    notesFile,
    "--latest",
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
console.info(`Published https://github.com/${repository}/releases/tag/${tag}`);
