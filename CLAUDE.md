# Ocelot

Single-user, read-only GitHub Obsidian reader behind Cloudflare Access.
Profile: ts-worker-web.
Direction: [project status](docs/00-project-status.md), [product contract](docs/01-product-contract.md).

## Sources of Truth

This handbook and [AGENTS.md](AGENTS.md) are the contract; hooks, CI and config are enforcement. Raise weaker enforcement to match. Frameworks must not rewrite the handbook.

| Fact | Where |
| --- | --- |
| Human docs | [README.md](README.md), numbered docs |
| Version | Root `package.json`; sidebar `vX.Y.Z` and public `GET /api/live` |
| Runtime | `wrangler.jsonc`; generated `worker/worker-configuration.d.ts` |
| Test/dev | `wrangler.local.jsonc`, `mock/`, synthetic `fixtures/` |
| Enforcement | `.husky/`, `.github/workflows/verify.yml`, Vitest/Playwright |
| Accidents | [Retrospective.md](Retrospective.md) |

## Project Invariants

- Source vaults remain read-only; preference/registration/cache writes never authorize modifying a GitHub repository. Keep private note content/paths, PATs and real fixture inventories out of Git.
- Verify Access JWT and configured owner before every asset/API/avatar/private-cache response except public `GET /api/live`. Keep workers.dev/preview disabled; production never imports synthetic transports/test controls.
- GitHub PATs live only in Worker Secrets (`GITHUB_TOKEN`, optional `GITHUB_TOKEN_EXPIRES_AT`), never ordinary Wrangler text vars, build variables, browser storage or logs. Missing current PAT rejects GitHub operations even if old health data is cached.
- Author profile lookup receives the verified normalized email's SHA-256. Profile loading is separate from reading; proxy only the allowed raster avatar origin with bounded content and preserve CSP.
- Pin Basalt 2.1.8/TypeScript 7.0.2; use Pierre Trees and Kami-inspired typography without treating Kami as a parser. Respect upstream notices and the [navigation](docs/07-basalt-navigation.md) contract.
- MVVM: Views render/dispatch, ViewModels own interaction state, models/services parse and access/cache GitHub. Authorize before cache reads; validate untrusted Markdown/HTML/SVG/URLs/paths/diagrams.
- Preserve cool blue-gray surfaces, text ≥11px, reduced motion, sidebar/header Basalt L0 and fixed logo x-offset 24px through animation. Keep virtual-tree geometry stable.

## Stack / Layout

| Component | Choice |
| --- | --- |
| Runtime | Vite/React SPA + Cloudflare Worker; D1 metadata/private R2 cache |
| Tooling | Bun 1.4.0, Node 26.8.1, TypeScript 7, Biome |
| Source | `src/` Views/ViewModels/models; `worker/`; `mock/`/`fixtures/` local simulation |
| Tests | `tests/unit/`, `tests/worker/`, `tests/e2e/` and release-model tests |

## Commands

Run from root. Local dev uses only synthetic repositories and needs no PAT/Cloudflare account.

```sh
bun install --frozen-lockfile
bun run dev
bun run types
bun run typecheck
bun run lint
bun run test:coverage
bun run build
bun run worker:check
bun x playwright install chromium
bun x playwright install webkit
bun run test:e2e
bun run check:security
```

G2 uses OSV 2.5.1 and gitleaks 8.30.1; CI verifies binaries. `types` uses the tracked empty `.dev.vars.example` only for deterministic generation, never deployment. `worker:check` packages production config as a dry run. Avoid overwriting generated bindings by hand.

## Verification

6DQ = L1/L2/L3 + G1/G2 + D1. Status: `enforced`, `planned`, `manual`, `N/A`. No focused/skipped tests; all four L1 metrics ≥95% across first-party non-View runtime code, including unexecuted files.

| Piece | Requirement and current reality | Status | Evidence |
| --- | --- | --- | --- |
| L1 | Statements/branches/functions/lines ≥95%; Worker/mock/release policy included | enforced | Vitest config, pre-push and CI |
| L2 | Real HTTP/SQLite across every API endpoint/method | planned | Worker tests/browser HTTP exist; no separate exhaustive API inventory gate |
| L3 | Reading/navigation/auth/cache behavior, accessibility | enforced | CI Playwright Chromium/WebKit with axe |
| G1 | Strict types and zero-error/warning lint | enforced | Pre-commit types/staged Biome, CI whole-tree checks |
| G2 | Required OSV + gitleaks | enforced | `check:security` and shared quality CI |
| D1 | Per-run local state and guards/marker before reset/seed | planned | `dev.mjs --test` uses local fake bindings but resets fixed `.wrangler/e2e` without marker checks |
| Build | Vite and Worker packaging | enforced | Verify CI builds and `worker:check` |
| Release | Matching CI/CD before immutable tag/release | enforced | Release policy/script and workflows |
| Docs | Status and behavior evidence updated before implementation | manual | Numbered document review |

Current pre-commit checks staged Biome plus working-tree types; pre-push runs working-tree coverage only. Target: check-only index L1/G1 <30s and stdin pushed-ref L2/G2 <3min. Never bypass hooks, suppress security checks or weaken coverage.

## Resources / Isolation

| Purpose | Port / resource | Isolation |
| --- | --- | --- |
| Dev | Caddy `https://ocelot.dev.hexly.ai/`, UI 7049 / Worker 37049 | `.wrangler/state`; inspector 38049 |
| Browser | UI 27049 / Worker 17049 | Fixed `.wrangler/e2e`; inspector 18049 |
| Production | `https://ocelot.hexly.ai`, Access team `nocoo` | Exact audience/bindings in Wrangler |

Keep registered ports and Caddy aligned and preserve existing servers. Required tests use new per-run SQLite/R2, reject remote bindings/credentials and verify local context plus `_test_marker` before fixtures/cleanup. Do not create remote `-test` resources or use developer/private vault data.

## Operations / Release

Authorized releases use `bun run release -- --dry-run` then the selected version (`patch` default; policy in [delivery](docs/16-release-policy.md)). Trusted main deploys after checks, migrations precede Worker code, and releases require matching successful CI/CD. Never rotate a PAT into ordinary vars or move published tags. Verify active version/tag and Access redirect; these checks do not replace authenticated private-vault UAT. Full runbook: [running/deployment](docs/06-running-and-deployment.md).

## Retrospective

Use [Retrospective.md](Retrospective.md) for narratives. Keep recurring project rules short; cross-project lessons belong in nmem/global rules, deterministic checks in hooks/tests.

- After credential-only recovery rerun the same failed workflow/explicit version; recover an existing published tag rather than moving it.
