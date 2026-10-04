# 17 · Dependency maintenance — 2026-10-05

Status: planned implementation; validation remains required.

## Scope

Apply the current non-major dependency issue targets in an isolated branch. Keep
each independent upgrade in its own commit. Do not use historical test results as
acceptance of this batch.

| Issue | Dependency | Requested version |
| --- | --- | --- |
| #4 | @biomejs/biome | 2.5.15 |
| #5 | @cloudflare/vitest-plugin | 1.3.4 |
| #6 | @cloudflare/workers-types | 5.20260930.2 |
| #7 | @types/hast | 3.0.5 |
| #10 | katex | 0.18.10 |
| #11 | lucide-react | 1.49.0 |
| #13 | vite | 8.3.1 |
| #15 | wrangler | 4.145.0 |
| #16 | yaml | 2.9.1 |

The Cloudflare plugin, Wrangler and Worker types form one compatibility group.
Published plugin 1.3.4 depends on Wrangler 4.145.0 and supports Vitest 4.1.x;
Wrangler's optional Worker-types peer requires 5.20260930.2. Regenerate bindings
with the normal `bun run types` command after updating this group.

## Boundaries

- #8, #9, #12 and #14 require numeric-major migrations and remain open.
- #17 is already satisfied by the current DOMPurify 3.4.16 override and lock.
- Current source pins Basalt 2.2.0 although the handbook still names 2.1.8. This
  batch preserves the existing source pin; it performs no Basalt migration.
- Retain TypeScript 7.0.2 and the existing Vitest 4.1.11 pair. Add no React View tests.
- Use synthetic local Worker fixtures. No private vault, live credentials,
  production mutation, local browser E2E, release tag or npm publication belongs
  to this dependency batch.

## Required acceptance

Run the frozen install, generated-binding check, strict typecheck and lint,
complete models/Worker coverage suite, Vite build, Worker packaging dry run,
OSV and the existing configured Gitleaks scan. Preserve normal commit/push hooks
and all four 95% coverage floors. Obtain two independent read-only reviews of the
final base/head. All current-head CI, configured browser jobs and repository
protections must pass before a commit-preserving PR merge.

Detailed command outputs, review records and issue-closure evidence are retained
in the dependency duty run `20261004T213347Z-72294a366d21` in the workflow task
receipt and its linked local evidence. An unexecuted check remains N/A.

## Validation fixture repair

The release-recovery fixture exceeded its unchanged five-second limit because
it launched the Bun release script with Vitest's Node process.execPath. Two
full isolated attempts took about 6.7 seconds. Running that same scenario with
the declared Bun runtime took about 2.8 seconds. Pin the real Bun executable
before adding mocked commands to PATH, and use it for the release CLI and mock
executables. Preserve all assertions, real temporary Git history and the limit.
The failed/interrupted runs remain recorded; complete final coverage must pass.
