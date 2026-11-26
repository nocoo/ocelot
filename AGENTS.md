# Ocelot

Single-user, read-only web reader for public and private GitHub Obsidian vaults on Cloudflare Workers behind Cloudflare Access (`ts-worker-web`).
Docs: [README.md](README.md) · [Status](docs/00-project-status.md) · [Contract](docs/01-product-contract.md) · [Deploy](docs/06-running-and-deployment.md) · [Retrospective](Retrospective.md)

## Commands

Run from root with Bun 1.4.0 (`packageManager`; CI Node 26.12.1), TS 7.0.2 strict, Biome, Husky. Local dev (`wrangler.local.jsonc`, `mock/`, `fixtures/`) uses synthetic repos only (no PAT or Cloudflare account).

```sh
bun install --frozen-lockfile
bun run dev  # https://ocelot.dev.hexly.ai/ -> 7049 / 37049
bun run types  # Bindings from empty .dev.vars.example
bun run typecheck  # S1
bun run lint  # S2 check-only Biome, 0 warnings
bun run test:coverage  # L1 Vitest models + worker, >= 80%
bun run test:l1-gate  # Pre-commit index-snapshot probe
bun run build  # B1 frontend bundle
bun run worker:check  # B1 prod Worker dry-run
bunx playwright install chromium  # Once per machine (L4)
bun run test:e2e  # L4 Desktop Chromium core smoke + axe (CI reuses B1 dist artifact)
bun run check:security  # G1 gitleaks (.gitleaks.toml) + G2 osv-scanner
bun run release -- --dry-run  # Preview scripts/release.ts
```

`.dev.vars.example` is tracked empty only for `bun run types`, never deployed; never hand-edit `worker/worker-configuration.d.ts` (CI asserts zero diff).

## Invariants

- Source vaults stay read-only; prefs, registrations, and cache never authorize GitHub writes.
- Public repo: no credentials, private vault contents/paths, or private fixtures (synthetic docs only). Keep reference repos read-only and preserve notices.
- Verify Access JWT + `OWNER_EMAIL` before every asset, API, avatar, or private-cache read except `GET /api/live`; keep Access identity separate from GitHub PATs.
- Disable `workers.dev` and preview URLs; prod (`worker/index.ts`, `wrangler.jsonc`) never imports `worker/local.ts`, `mock/`, or test controls.
- Keep `GITHUB_TOKEN` (and optional `GITHUB_TOKEN_EXPIRES_AT`) in Worker Secrets only — never Wrangler vars, `VITE_*`, build vars, storage, assets, or logs; missing PAT fails closed even with cached health.
- Profile lookup sends verified normalized email SHA-256, decoupled from reading; proxy only the allowed raster avatar origin with bounded size and CSP ([12](docs/12-author-profile-recovery.md)).
- Treat Markdown, HTML, SVG, URLs, repo paths, and diagrams as untrusted; block executable content and validate paths.
- Pin `@nocoo/basalt` (3.6.0), TS (7.0.2), and `@pierre/trees`; adapt Kami typography without treating it as a parser/UI lib.
- MVVM: Views render/forward intents only; ViewModels own UI state; models/services own parsing, GitHub, and caching. Prefer pure composition; authorize before cache reads.
- UI: cool blue-gray palette, shared Basalt L0 sidebar/header bg, ≥11px text, distinct states, reduced motion ([08](docs/08-visual-identity.md)).
- Nav: gap adjacent hovered/selected Pierre rows without changing virtual row height; fix sidebar logo at 24px left across transitions — never center ([07](docs/07-basalt-navigation.md)).
- Root `package.json` is sole version source (`vX.Y.Z` in sidebar, `X.Y.Z` at `GET /api/live`); raise weaker checks to match contracts, never lower them.
- Update numbered `docs/NN-*.md` before coding with honest status/evidence; distinguish requirements, proposals, decisions, and completed work.
- Authorized releases only: preview `bun run release -- --dry-run` (`patch` default); migrations precede Worker code after matching `main` CI ([16](docs/16-release-policy.md)).
- Never move published tags; after credential fixes rerun failed workflow/version or recover existing tags. Live checks never replace private-vault UAT ([09](docs/09-identity-and-delivery.md)).

## Quality & Local Gates

Follows `system1-quality`; CI slots and pinned `base-ci` live in `.github/workflows/quality-slots.yml` (`verify.yml` -> `quality / Z1: Gate` on `main`). Statuses: `enforced`, `planned`, `manual`, `N/A`. No focused/skipped tests.

- **Exceptions / gaps**: `L2 Runtime` `N/A` (L1 `worker` Miniflare); `L3 Integration` `N/A` in CI (API inventory gate `planned`); `P1 Package` `enforced` (`bun run worker:check` on `B1` artifact); docs `manual`; E2E `_test_marker` `planned`.
- **Coverage**: V8 ≥80% (stmts/branches/funcs/lines) on `src/**`, `worker/**`, `scripts/release-model.ts` (incl. unexecuted); excludes `src/views/**`, `src/main.tsx`, `mock/**`, `**/*.d.ts`.
- **Views**: Never blanket-exclude `.tsx`/Worker; verify Views via Playwright, axe, and visual checks (no View UTs required).
- **Hooks**: `bun run prepare` installs `.husky/`; `pre-commit` runs `typecheck`, `lint`, `test:coverage` on a `git checkout-index` snapshot (<30s; tested by `test:l1-gate`).
- **Pre-push**: `.husky/pre-push` runs working-tree `test:coverage` (stdin pushed-ref L3/G2 <3m `planned`). Never bypass hooks, suppress security scans, or weaken coverage.

## Resources & Isolation

| Lane | Endpoint / State (UI / Worker / inspector)                                | Boundary                                       |
| ---- | ------------------------------------------------------------------------- | ---------------------------------------------- |
| Dev  | `https://ocelot.dev.hexly.ai/`, `7049`/`37049`/`38049`, `.wrangler/state` | Synthetic only; preserve dev server & Caddy    |
| E2E  | `127.0.0.1`, `27049`/`17049`/`18049`, fixed `.wrangler/e2e`               | Single run; per-run + `_test_marker` `planned` |
| Prod | `https://ocelot.hexly.ai`, Access `nocoo`, `wrangler.jsonc`               | Read-only unless authorized; no remote `-test` |

Tests reject remote bindings/credentials and private vault data; never run parallel E2E sessions against `.wrangler/e2e`.

## Retrospective

Record incidents in [Retrospective.md](Retrospective.md); promote recurring rules to `Invariants` and enforceable checks to tests/hooks.
