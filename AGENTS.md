# Ocelot

Single-user, read-only web reader for public and private GitHub Obsidian vaults.
The application runs on Cloudflare Workers behind Cloudflare Access.

## Working agreement

- Keep numbered documents in `docs/`. Write or update the relevant document
  before implementation, and record its current status and verification evidence.
- Distinguish user requirements, proposed decisions, accepted decisions, and
  completed work. A proposal is not an implemented feature.
- Make small, coherent, atomic commits directly to `main` and push to
  `origin/main`. This is explicitly authorized by the project owner.
- Keep this public repository free of credentials, private vault contents,
  private note paths, and private fixtures. Use synthetic test documents.
- Read reference projects without modifying them. Preserve upstream licenses
  and notices when adapting their code, templates, or assets.

## Implementation constraints

- Vite, React, TypeScript **7.0.2**, Biome, and Husky.
- Use the published **@nocoo/basalt 2.1.7** for controls and application layout;
  consult `../basalt/INTEGRATION.md` and its package integration recipes.
- Adapt Kami's Chinese/English document typography to Ocelot's visual identity.
  Kami is a design/template system, not a Markdown parser or React UI package.
- Use `@pierre/trees` from `pierrecomputer/pierre` for file navigation. Verify
  and pin the published version before integration.
- Use MVVM: Views render state and forward user intents; ViewModels own
  interaction state; Models/services own parsing, GitHub access, and caching.
  Keep business logic out of Views. Prefer functions and direct composition.
- Unit-test coverage must reach **95% for statements, branches, functions,
  and lines** across first-party non-View runtime code. Include untested source
  files in coverage. Only presentation-only Views and generated/declaration
  files are excluded; do not blanket-exclude `.tsx` or the Worker.
- Verify Views through browser flows, accessibility, and visual inspection;
  View unit tests are not required.
- GitHub repositories remain read-only. Local app preferences, repository
  registrations, and cache writes do not authorize writes to a source vault.
- Use a restrained cool blue-gray identity with distinct surface, text,
  selected, focused, loading, and disabled states. Respect reduced motion.

## Security boundaries

- Cloudflare Access identity and GitHub repository credentials are separate.
- GitHub credentials live only in Worker Secrets; never in `VITE_*`, browser
  storage, public build assets, or application logs.
- Authorize every private content and attachment request before cache access.
  Protect or disable alternate deployment and preview URLs.
- Treat Markdown, HTML, SVG, URLs, repository paths, and diagrams as untrusted
  input. Restrict executable content and validate paths at the boundary.
- Architectural choices under discussion are recorded in `docs/`; consult the
  current status before treating a recommendation as accepted.
