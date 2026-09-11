export function parseVersion(value: string): [number, number, number] {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(value))
    throw new Error(`Expected X.Y.Z, received: ${value}`);
  const parts = value.split(".").map(Number);
  if (!parts.every(Number.isSafeInteger))
    throw new Error("Version components must be safe integers.");
  return parts as [number, number, number];
}

export function releaseOptions(args: string[]) {
  const positional = args.filter((argument) => argument !== "--" && argument !== "--dry-run");
  if (positional.length > 1) throw new Error("Pass one bump type or explicit version.");
  const requested = positional[0];
  if (requested && !["patch", "minor", "major"].includes(requested)) parseVersion(requested);
  return { requested, dryRun: args.includes("--dry-run") };
}

function compare(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

export function chooseVersion({
  current,
  requested,
  previous,
  changedLines,
  now,
}: {
  current: string;
  requested?: string;
  previous: { version: string; releasedAt: number } | null;
  changedLines: number;
  now: number;
}): string {
  const [major, minor, patch] = parseVersion(current);
  if (previous && compare(current, previous.version) < 0)
    throw new Error("The package version is behind the last release.");
  if (requested && !["patch", "minor", "major"].includes(requested)) {
    if (compare(requested, current) < 0)
      throw new Error("A release cannot lower the package version.");
    return requested;
  }
  // An untagged version can be the initial release or a retry after failed CI.
  if (!requested && (!previous || current !== previous.version)) return current;
  const bump =
    requested ??
    (previous && (now - previous.releasedAt > 3 * 86400_000 || changedLines > 500)
      ? "minor"
      : "patch");
  const next =
    bump === "major"
      ? `${major + 1}.0.0`
      : bump === "minor"
        ? `${major}.${minor + 1}.0`
        : `${major}.${minor}.${patch + 1}`;
  parseVersion(next);
  return next;
}

export function releaseNotes(commits: { hash: string; subject: string }[]): string {
  const groups = new Map<string, string[]>();
  const headings: Record<string, string> = {
    feat: "Features",
    fix: "Fixes",
    docs: "Documentation",
    test: "Tests",
  };
  for (const { hash, subject } of commits) {
    if (/^chore: release v?\d+\.\d+\.\d+$/u.test(subject)) continue;
    const match = subject.match(/^(\w+)(?:\([^)]*\))?!?: (.+)$/u);
    const heading = headings[match?.[1] ?? ""] ?? "Maintenance";
    const entries = groups.get(heading) ?? [];
    entries.push(
      `- ${match?.[2] ?? subject} ([${hash.slice(0, 7)}](https://github.com/nocoo/ocelot/commit/${hash}))`,
    );
    groups.set(heading, entries);
  }
  return (
    [...groups]
      .map(([heading, entries]) => `### ${heading}\n\n${entries.join("\n")}`)
      .join("\n\n") || "- Initial release."
  );
}

export function updateChangelog(
  existing: string,
  version: string,
  date: string,
  notes: string,
): string {
  const sections = existing.trim().split(/(?=^## )/mu);
  const preamble = sections[0]?.startsWith("# ") ? sections.shift()?.trim() : "# Changelog";
  return `${[
    preamble,
    `## [${version}] - ${date}\n\n${notes}`,
    ...sections
      .filter(
        (section) =>
          !section.startsWith(`## [${version}]`) && !section.startsWith("## [Unreleased]"),
      )
      .map((section) => section.trim())
      .filter(Boolean),
  ].join("\n\n")}\n`;
}

export function deploymentVersion(value: unknown): string {
  const versions = (value as { versions?: { version_id?: unknown; percentage?: unknown }[] } | null)
    ?.versions;
  const active = Array.isArray(versions) && versions.length === 1 ? versions[0] : null;
  if (
    active?.percentage !== 100 ||
    typeof active.version_id !== "string" ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(active.version_id)
  )
    throw new Error("Production must serve exactly one Worker version at 100% traffic.");
  return active.version_id;
}

export function assertDeploymentTag(value: unknown, expected: string): void {
  const tag = (value as { annotations?: Record<string, unknown> } | null)?.annotations?.[
    "workers/tag"
  ];
  if (tag !== expected)
    throw new Error("The deployed Worker does not match this version and Git revision.");
}
