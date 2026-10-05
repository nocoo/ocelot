# Retrospective

No accident narratives have been recorded in this log yet.

Record the date when known, what happened, its cause, and the follow-up. Do not invent an incident to populate this file. Keep recurring project rules brief in `AGENTS.md`; cross-project lessons belong in global rules or nmem, and deterministic checks belong in hooks or tests.

## 2026-10-05 — Use the declared release runtime in fixtures

The five-second release-recovery test timed out during dependency validation.
Vitest runs in Node, and the fixture used process.execPath for a release command
that package.json explicitly runs with Bun. Two real fixture release attempts
spent about 6.7 seconds in repeated child command launches. Timing the same
isolated workflow with the declared Bun runtime reduced that to about 2.8 seconds.

Use the real Bun executable for the release CLI and its mock executables, resolved
before constructing the fixture PATH. Keep every assertion, real temporary Git
history, the five-second timeout and fail-closed mocked remote behavior. No real
release or production action is performed. Failed and diagnostic runs remain
recorded; only successful final-head checks qualify for acceptance.

An initial env-based Bun shebang selected the fixture's own mocked bun and
stalled; only this run's descendant test processes were stopped. Pinning Bun only
for the mock executables was insufficient. Measure the complete subprocess path
and match the application's declared runtime before treating an optimization as
a fix. This test change never disables the repository's normal hooks.

## 2026-10-05 — Synchronize the deployment toolchain constraint

The dependency PR upgraded the direct Wrangler dependency and lock to 4.145.0
but missed the separate 4.131.0 expectation in release.yml. Local checks, PR CI
and trusted-main CI passed; the deployment workflow then correctly rejected the
mismatch before migration or upload. The nine dependency issues had already
closed, so their source completion and failed delivery must be reported separately.

Synchronize the release constraint, and add an existing-suite contract assertion
that parses the actual workflow and compares its Wrangler version with the
authoritative manifest. The assertion failed on the stale pin before the fix.
Future dependency reviews must trace version pins into publication consumers,
not stop at manifests, lockfiles and build commands. Preserve the failed delivery
run and validate the normal automatic pipeline after the follow-up merge.
