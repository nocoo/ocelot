# Ocelot

Single-user, read-only web reader for public and private GitHub Obsidian vaults, running on Cloudflare Workers behind Cloudflare Access.
Profile: ts-worker-web.
Direction: [project status](docs/00-project-status.md), [product contract](docs/01-product-contract.md).

## Scope and instruction sources

- This file applies throughout the repository.
- Maintain this file as the only root handbook; do not recreate `CLAUDE.md`, a symlink, an import or a compatibility alias. Frameworks must not rewrite the handbook.
- Keep numbered documents in `docs/`. Write or update the relevant document before implementation, recording its current status and verification evidence. Distinguish user requirements, proposed decisions, accepted decisions and completed work: a proposal is not an implemented feature.
- Source of truth: root `package.json` (sole version source), `wrangler.jsonc` plus generated `worker/worker-configuration.d.ts`, `wrangler.local.jsonc` with `mock/` and synthetic `fixtures/`, `.husky/`, `.github/workflows/verify.yml`, `vitest.config.ts` and Playwright. Raise weaker enforcement to match; record drift rather than lowering the contract.

## Setup and commands

Run from the repository root. Bun 1.4.0 (`packageManager`; CI pins Node 26.8.1), TypeScript 7.0.2 strict, Biome, Husky. Local development uses only synthetic repositories and needs no PAT or Cloudflare account.

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

`types` uses the tracked empty `.dev.vars.example` only for deterministic generation, never deployment; avoid overwriting generated bindings by hand (CI verifies the generated file is unchanged). `worker:check` packages the production config as a dry run. G2 uses osv-scanner 2.5.1 and gitleaks 8.30.1; CI verifies the binaries.

## Project boundaries

- Source vaults remain read-only. Local app preferences, repository registrations and cache writes never authorize writes to a GitHub repository.
- Keep this public repository free of credentials, private vault contents, private note paths and private fixtures; use synthetic test documents. Read reference projects without modifying them; preserve upstream licenses and notices when adapting their code, templates or assets.
- Verify the Access JWT and configured owner before every asset, API, avatar or private-cache response except the public `GET /api/live`. Keep `workers.dev` and preview URLs disabled; production never imports synthetic transports or test controls. Cloudflare Access identity and GitHub repository credentials stay separate.
- GitHub PATs live only in Worker Secrets (`GITHUB_TOKEN`, optional `GITHUB_TOKEN_EXPIRES_AT`) — never ordinary Wrangler text vars, `VITE_*`, build variables, browser storage, public build assets or logs. A missing current PAT rejects GitHub operations even when old health data is cached.
- Author profile lookup receives the verified normalized email's SHA-256. Profile loading is separate from reading; proxy only the allowed raster avatar origin with bounded content and preserve CSP.
- Treat Markdown, HTML, SVG, URLs, repository paths and diagrams as untrusted input; restrict executable content and validate paths at the boundary.
- Pin Basalt 2.1.8 and TypeScript 7.0.2; use `@pierre/trees` for file navigation (verify and pin the published version before integration). Adapt Kami's Chinese/English typography without treating Kami as a parser or React UI package. Follow the [navigation](docs/07-basalt-navigation.md) contract.
- Use MVVM: Views render state and forward intents; ViewModels own interaction state; models/services own parsing, GitHub access and caching. Keep business logic out of Views; prefer functions and direct composition. Authorize before cache reads.
- Unit-test coverage reaches 95% for statements, branches, functions and lines across first-party non-View runtime code, including unexecuted files. Only presentation-only Views and generated/declaration files are excluded; do not blanket-exclude `.tsx` or the Worker. Verify Views through browser flows, accessibility and visual inspection; View unit tests are not required.
- Keep the restrained cool blue-gray identity with distinct surface, text, selected, focused, loading and disabled states; respect reduced motion. Sidebar and header share the Basalt L0 background; interface text is at least 11px; keep visible spacing between adjacent hovered/selected tree backgrounds without changing virtual row geometry. Keep the sidebar logo at the fixed 24px left offset when expanded, collapsed and throughout the transition (Surety rule); never center it dynamically.
- Keep root `package.json` the sole version source; show its `vX.Y.Z` beside the sidebar name and return `X.Y.Z` from public `GET /api/live`.

## Testing and quality contract

Run the checks relevant to the changed scope; hook and CI requirements still apply. Unit tests run Vitest projects `models` (node) and `worker` (Cloudflare plugin, D1 migrations); browser verification runs Playwright. Statuses: `enforced`, `planned`, `manual`, `N/A`. No focused or skipped tests.

| Dimension | Required contract | Current status and evidence |
| --- | --- | --- |
| L1 — pre-commit quality | UT with statements, branches, functions and lines each ≥95%; strict types and check-only lint with zero errors/warnings; installed hook on the index snapshot; failure rejection; under 30s | planned. `vitest.config.ts` uses Istanbul with 95/95/95/95 thresholds over `src/**/*.{ts,tsx}`, `worker/**/*.ts`, `mock/**/*.ts` and `scripts/release-model.ts`, excluding only `src/views/**`, `src/main.tsx` and `**/*.d.ts`. Pre-commit runs staged Biome (`--error-on-warnings`) plus working-tree `typecheck`; pre-push runs working-tree coverage only; the CI quality job runs the generated-types diff, lint, typecheck, coverage and build. No hook consumes the index snapshot or proves rejection timing, so unified L1 stays planned while its subchecks are configured and executing. |
| L2 — integration | Real HTTP/SQLite across every API endpoint/method | planned. Worker tests and browser HTTP exist; there is no separate exhaustive API inventory gate. |
| L3 — system | Reading, navigation, auth and cache behavior, accessibility | enforced. CI browser job runs Playwright e2e on Chromium and WebKit with axe. |
| G2 — security | Dependency and secret scans; missing required scanners fail | enforced. `check:security` runs osv-scanner over `bun.lock` and gitleaks with the tracked `.gitleaks.toml`; the shared quality CI receives the same config. |
| D1 — isolation | Per-run local state and guards/marker before reset/seed | planned. `dev.mjs --test` uses local fake bindings but resets the fixed `.wrangler/e2e` directory without marker checks. |
| Build | Vite and Worker packaging | enforced. Verify CI builds plus `worker:check`. |
| Release | Matching CI/CD before immutable tag/release | enforced. Release policy/script and workflows. |
| Docs | Status and behavior evidence updated before implementation | manual. Numbered document review. |

Current pre-commit checks staged Biome plus working-tree types; pre-push runs working-tree coverage only. Target: check-only index L1 in under 30s and stdin pushed-ref L2/G2 in under 3 minutes; those targets are not implemented. Never bypass hooks, suppress security checks or weaken coverage.

The owner merged former G1 into L1 on 2026-09-21; the framework keeps the 6DQ name: L1, L2, L3, G2 and D1. Use `system0-6dq-l1` for the L1 contract and its S/A/B/F rubric.

## Resources / Isolation

| Purpose | Port / resource | Isolation |
| --- | --- | --- |
| Dev | Caddy `https://ocelot.dev.hexly.ai/`, UI 7049 / Worker 37049 | `.wrangler/state`; inspector 38049 |
| Browser | UI 27049 / Worker 17049 | Fixed `.wrangler/e2e`; inspector 18049 |
| Production | `https://ocelot.hexly.ai`, Access team `nocoo` | Exact audience/bindings in Wrangler |

Keep registered ports and Caddy aligned and preserve existing servers. Required tests use new per-run SQLite/R2, reject remote bindings/credentials and verify local context plus `_test_marker` before fixtures/cleanup. Do not create remote `-test` resources or use developer/private vault data.

## Operations / Release

Operational commands and release recovery live in this handbook's operations section, [running/deployment](docs/06-running-and-deployment.md) and [identity/delivery](docs/09-identity-and-delivery.md). Make small, coherent, atomic commits directly to `main` and push to `origin/main`; this is explicitly authorized by the project owner.

Authorized releases use `bun run release -- --dry-run` then the selected version (`patch` default; policy in [delivery](docs/16-release-policy.md)) via `scripts/release.ts`. Trusted `main` deploys after checks, migrations precede Worker code, and publishing requires the matching successful CI/CD. Never rotate a PAT into ordinary vars or move published tags. Verify the active version/tag and Access redirect; these checks do not replace authenticated private-vault UAT.

## Retrospective

Use [Retrospective.md](Retrospective.md) for narratives. Keep recurring project rules short here; cross-project lessons belong to nmem/global rules, deterministic checks in hooks/tests.

- After credential-only recovery rerun the same failed workflow/explicit version; recover an existing published tag rather than moving it.
