# 16 · 交付、凭据与发布恢复

详细交付约定。日常命令、6DQ 与测试隔离差距见根 AGENTS.md；本页不构成新的部署授权。



- Write numbered docs before implementation and record honest verification status.
- `CLOUDFLARE_API_TOKEN` is the repository Actions secret for CD. The account ID
  is public configuration. Test jobs never receive deployment credentials.
- GitHub vault credentials are separate: Worker Secret `GITHUB_TOKEN`, with
  optional `GITHUB_TOKEN_EXPIRES_AT`. Never put a PAT in Actions build variables,
  `VITE_*`, source, browser storage, logs, screenshots, or test fixtures.
  In the Dashboard select Secret, not Text: Wrangler replaces ordinary variables
  from config. Session status must reject a missing current PAT even if D1 still
  holds an earlier healthy result.
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
