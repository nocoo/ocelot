<p align="center">
  <img src="../assets/brand/icon-rounded.png" width="128" height="128" alt="Ocelot: a faceted wild cat watching a colorful paper bird">
</p>

<h1 align="center">Ocelot</h1>
<p align="center">Read public and private GitHub Obsidian vaults without changing their source.</p>
<p align="center"><a href="https://ocelot.hexly.ai">Website</a> · <a href="../README.md">简体中文</a></p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/reader-dark.png">
  <img src="assets/reader-light.png" alt="Ocelot's vault tree, article and outline, using synthetic example notes">
</picture>

## What it does

A quiet, private reading room. Connect public or private Obsidian vaults on GitHub and read through folders,
wiki links and article outlines. Ocelot is a single-user reader; source repositories remain read-only.

Basalt **2.1.8** supplies controls and layout, Pierre Trees supplies virtualized navigation, and Chinese/English
document typography takes cues from [Kami](https://github.com/tw93/Kami). The cool blue-gray interface supports
light/dark themes, mobile layouts, keyboard navigation and reduced motion.

## Features

- Render GFM, frontmatter, Obsidian wiki links and aliases, heading/block anchors, callouts, tables, code, math and Mermaid diagrams.
- Keep embedded notes and attachments on the same Git revision. External tracking images and executable content are blocked.
- Use a separate reader control group for full width, typography and Raw Markdown; scroll long outlines independently, return to the top and enlarge images in a lightbox.
- Search filenames and paths with `⌘K` / `Ctrl+K`. The tree supports keyboard selection, expansion and change indicators.
- Cache note content on demand. Conditional checks run every 60 seconds while the page is visible and pause when hidden. Unchanged trees are not transferred again.
- Apply updates explicitly while preserving the reading position and expanded folders. Slow requests keep the current article visible.
- Receive a reminder seven days before a PAT expires. After rotating it on the server, check again to resume reading.

## Usage

Open [Ocelot](https://ocelot.hexly.ai), sign in through Cloudflare Access, select a vault and follow its tree, wiki links and outline. Real vaults require an administrator to set the `GITHUB_TOKEN` Worker Secret. The local demo uses synthetic data without connecting to real GitHub. See [running and deployment](06-running-and-deployment.md).

## Development

Use Node.js 26.8.1 and Bun 1.4.0:

```sh
bun install --frozen-lockfile
bun run dev
```

Open <https://ocelot.dev.hexly.ai/> with [local Caddy HTTPS](11-local-https.md)
(direct diagnostic port: `7049`). The demo uses a real local Wrangler Worker, SQLite D1 and disk-backed R2.
It needs no PAT or Cloudflare account and stores its data under `.wrangler/state`.

Synthetic fixtures provide three repositories, 1,177 visible notes in the main vault, original images and two Git revisions.
The welcome note links to a 48-chapter article with 144 outline entries and illustrated Markdown examples with varied image dimensions.
The top-right flask button demonstrates slow loading, expiry reminders, invalid credentials, rate limits, offline behavior and new commits.
Add the third example, `ocelot-demo/reading-room`, through the repository dialog.

```sh
bun run typecheck
bun run lint
bun run build
bun run worker:check
```

See [running and deployment](06-running-and-deployment.md) for releases, PAT rotation and live-environment acceptance.

## Tests

```sh
bun run test:coverage
bun x playwright install chromium
bun x playwright install webkit
bun run test:e2e
```

Vitest checks non-View logic and the Worker. Playwright uses an independent Wrangler instance and production frontend to verify reading, navigation, authentication, caching and accessibility. Historical results and support boundaries are in the [runtime and verification record](05-runtime-contract-and-verification.md).

## Stack

| Technology | Role |
| --- | --- |
| React, Vite, TypeScript | MVVM reader and frontend builds |
| Basalt, Pierre Trees | Controls, layouts and virtualized navigation |
| Cloudflare Workers, Access | APIs and viewer identity verification |
| D1, private R2 | Metadata and rebuildable caches |
| Biome, Vitest, Playwright | Static, logic and browser checks |

## Documentation

- [00 · Project status and index](00-project-status.md)
- [01 · Product and engineering contract](01-product-contract.md)
- [02 · GitHub authentication, caching and updates](02-github-auth-cache-and-sync.md)
- [03 · Reference projects](03-reference-projects.md)
- [04 · Implementation and local acceptance](04-implementation-and-local-testing.md)
- [05 · Runtime contract and verification](05-runtime-contract-and-verification.md)
- [06 · Running, PAT rotation and deployment](06-running-and-deployment.md)
- [07 · Basalt navigation and reading chrome](07-basalt-navigation.md)
- [08 · Visual identity](08-visual-identity.md) · [Brand assets](../assets/brand/README.md)
- [09 · Identity, versioning and delivery](09-identity-and-delivery.md)
- [Operations](../AGENTS.md) · [Changelog](../CHANGELOG.md)
- [Contributor agreement](../AGENTS.md) · [Third-party notices](../THIRD_PARTY_NOTICES.md)

Make coherent atomic commits on `main`. This public repository contains the application and synthetic fixtures,
not private notes, real vault inventories or runtime credentials.

## License

The repository has no project-level LICENSE. See [third-party notices](../THIRD_PARTY_NOTICES.md) for dependency terms.
