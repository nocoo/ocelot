# Ocelot

@AGENTS.md

Single-user, read-only GitHub Obsidian reader on Cloudflare Workers. `AGENTS.md`
is the engineering contract; this file is the operational entry point. Keep both
aligned with actual scripts and numbered documents. Read
[the status index](docs/00-project-status.md) before changing behavior.

## Sources of truth

| Topic | Source |
| --- | --- |
| Requirements, MVVM, coverage | `AGENTS.md`, `docs/01-product-contract.md` |
| PAT, immutable cache, authorization freshness | `docs/02-github-auth-cache-and-sync.md` |
| Running locally and rotating PATs | `docs/06-running-and-deployment.md` |
| Basalt/Pierre navigation and typography | `docs/07-basalt-navigation.md` |
| Identity, versioning and CI/CD | `docs/09-identity-and-delivery.md` |
| Version | Root `package.json` only; store `X.Y.Z`, display `vX.Y.Z` |
| Production bindings | `wrangler.jsonc`; regenerate `worker/worker-configuration.d.ts` |
| Local simulation | `wrangler.local.jsonc`, `mock/`, synthetic `fixtures/` |
| Verification and delivery | `.github/workflows/verify.yml`, `.husky/`, `scripts/` |

## Commands

```sh
bun install --frozen-lockfile
bun run dev
bun run check
bun run worker:check
bun run test:e2e
bun run check:security
bun run types
bun run release -- --dry-run
bun run release -- patch
```

Use Node 26.8.1 and Bun 1.4.0. Basalt 2.1.7 and TypeScript 7.0.2 stay pinned.
Security checks require OSV Scanner 2.5.1 and Gitleaks 8.30.1; CI verifies their
binary checksums. Do not bypass hooks, coverage thresholds or security scans.

## Runtime boundaries

- Production is `https://ocelot.hexly.ai`, Access team `nocoo`. The exact AUD is
  in Wrangler config. Verify the JWT and configured owner before assets, APIs,
  avatars and cached vault content. `/api/live` is authenticated too.
- `workers.dev` and preview URLs stay disabled. Production never imports the
  local Worker entry, synthetic transport, or test controls.
- The author service receives SHA-256 of the verified normalized email. Load
  profile details separately from reading. Proxy only the configured public
  avatar origin, with bounded raster content; preserve the restrictive CSP.
- Local UI/API ports are 5173/8787; browser tests use 5174/8788 with independent
  SQLite D1 and R2 state. Never reuse the developer or production resources for
  tests. Preserve other worktrees and their running servers.
- Tests include all unexecuted non-View runtime source and release policy.
  Minimum statements/branches/functions/lines: 95%. Views use Playwright and axe.
  CLI publication is checked through an isolated temporary Git repository and
  the actual CI/CD result; a dry run cannot publish.

## Delivery

- Write numbered docs before implementation and record honest verification
  status. Make atomic commits to `main` and push; authorization is already given.
- `CLOUDFLARE_API_TOKEN` is the repository Actions secret for CD. The account ID
  is public configuration. Test jobs never receive deployment credentials.
- GitHub vault credentials are separate: Worker Secret `GITHUB_TOKEN`, with
  optional `GITHUB_TOKEN_EXPIRES_AT`. Never put a PAT in Actions build variables,
  `VITE_*`, source, browser storage, logs, screenshots, or test fixtures.
  Initial deployment can serve an authenticated empty reader without a PAT;
  GitHub operations still reject missing credentials. The empty declaration in
  `.dev.vars.example` is used only for deterministic type generation, never deploy.
- CI verifies types, Biome, ≥95% coverage, Worker packaging, browser behavior,
  OSV and Gitleaks. Trusted `main` deploys only after all checks pass. Production
  deployments are serialized and reject superseded revisions.
- The deploy script inspects/creates only the named Ocelot D1 database, applies
  migrations before code deployment, and lets Wrangler provision the named
  private R2 bucket. It verifies the active Worker version/Git tag and the Access
  redirect. Do not confuse these checks with authenticated private-vault UAT.
- Release policy follows nmem `f1ee6f38-dc59-4f41-83c8-2a2663f32c31` and the
  current `../hexly.ai` release flow: clean main, version/changelog commit,
  successful matching CI/CD, then immutable annotated tag and GitHub Release.
  Default patch; more than 3 days or 500 changed lines selects minor. Explicit
  patch/minor/major/X.Y.Z overrides selection. An untagged version can be retried.
- After a credential-only fix, rerun the failed GitHub workflow for the same
  commit before retrying the explicit release version. Never move a published
  tag. If only GitHub Release creation failed, recover from the existing tag.

Production readiness and remaining user-supplied configuration are recorded in
document 09. Report actual remote outcomes, including any missing configuration.
