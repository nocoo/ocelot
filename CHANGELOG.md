# Changelog

Release entries are generated from Git commits by `bun run release`.

## [0.3.1] - 2026-09-19

### Maintenance

- preload recent notes and reuse snapshot session caches ([c22f65a](https://github.com/nocoo/ocelot/commit/c22f65a96913c42e81242222d3b8a9408c215865))
- Refine reader toolbar icons and fix Mermaid image rendering ([501bb79](https://github.com/nocoo/ocelot/commit/501bb79ffeababedc3dce3a6e49b529846d5407c))
- pin @nocoo/basalt 2.1.8 ([dca0ae8](https://github.com/nocoo/ocelot/commit/dca0ae878b1eb771b814a0e5a7d2d3feb5c21d7f))
- Stale Primer Octicons notice and license; the UI uses Lucide ([46cd5da](https://github.com/nocoo/ocelot/commit/46cd5da4001fab5dd8faa211862a56b3bb5b90f1))
- Merge pull request #3 from nocoo/co/20260918-ocelot-cleanup ([081717a](https://github.com/nocoo/ocelot/commit/081717a14675d3527553e750dbb2450d3a1be183))

### Documentation

- record social-card metadata removal behind Access ([c6185db](https://github.com/nocoo/ocelot/commit/c6185db29178e1af56a93a4066d6a6b3d4980a06))
- align current basalt contract with 2.1.8 ([eec8eac](https://github.com/nocoo/ocelot/commit/eec8eac7ac55c90ee6edd58074e2b024bd0f8de4))
- standardize agent handbook and retrospective ([4e5796e](https://github.com/nocoo/ocelot/commit/4e5796e13504167d783fd5ee3fd2586d1b22ceea))
- allow public GET /api/live ([f8d9e46](https://github.com/nocoo/ocelot/commit/f8d9e46959dff3e3aaf88fa4d1b32225ed426100))

### Fixes

- align header github hexly theme chrome ([18670d5](https://github.com/nocoo/ocelot/commit/18670d55ebff6d74ed1ddcad0584a5308e9a3f7d))
- align diagram checks with three-state theme ([33db8d7](https://github.com/nocoo/ocelot/commit/33db8d7c6b6c9ae1e2a2c83ef139c857a36aa247))

### Tests

- restore theme persistence after reload ([33cd7b9](https://github.com/nocoo/ocelot/commit/33cd7b9af3138609a1a6514bdffc1e4a369fbed4))

### Features

- serve public GET /api/live ([6cc057d](https://github.com/nocoo/ocelot/commit/6cc057d2756e2aebb1e06c5d81880dfd1ee288f3))

## [0.3.0] - 2026-09-12

### Documentation

- record verified v0.2.0 release ([3b82fbb](https://github.com/nocoo/ocelot/commit/3b82fbb32947fa6e4a0fab36fbbcda792b64c584))

### Fixes

- justify reader paragraphs on mobile and desktop ([dc82808](https://github.com/nocoo/ocelot/commit/dc82808f82f4a1fd650324c401f029dcc5613527))
- map account id from secret or var ([a374609](https://github.com/nocoo/ocelot/commit/a3746097c2bff483c396d931de671bfb5b9305df))
- name the shared quality workflow ci ([dd13a26](https://github.com/nocoo/ocelot/commit/dd13a267f14f864a2a8ef70c7643d78b44aa8deb))
- retain shared browser job diagnostics ([3a0910b](https://github.com/nocoo/ocelot/commit/3a0910b788f48ec8e1a13cecd6f30609ac564092))
- verify independent CI and production deployment before release ([c66d449](https://github.com/nocoo/ocelot/commit/c66d449d7a15eac8032a6683c5f7872763e8b794))
- restore native mobile tree scrolling and close after article navigation ([3fbfb94](https://github.com/nocoo/ocelot/commit/3fbfb941b79bc5c9696da340eb1bee746e8a5f4c))

### Maintenance

- migrate workflows to base-ci ([e707370](https://github.com/nocoo/ocelot/commit/e7073707a0d68329b27d41494ca415fbfc71d70d))
- pin base-ci to verified sha ([1ad7689](https://github.com/nocoo/ocelot/commit/1ad7689b56ab1aa9c109659e39f17ad67c9dbe9c))
- drop unused ci secrets inherit ([b7df70e](https://github.com/nocoo/ocelot/commit/b7df70ea2dcaacc4f8dd4320dc6fd2207743c8d1))
- pin base-ci to ad43150 ([ea048dc](https://github.com/nocoo/ocelot/commit/ea048dcb40d581dd431bde7c0d6fb98b8892b7e6))

### Features

- maintain the 50 latest articles from immutable GitHub history ([4e8ef42](https://github.com/nocoo/ocelot/commit/4e8ef424ebe0346a8fdcb21fd3600bc55daffec1))

## [0.2.0] - 2026-09-11

### Fixes

- report missing credentials and stop idle sidebar loading ([c9fbaff](https://github.com/nocoo/ocelot/commit/c9fbaff715f123e27bb851b20710d68cb1718d66))
- complete reader controls and long-article navigation ([5809154](https://github.com/nocoo/ocelot/commit/58091545861d51072d228d1fce5db538175548f7))
- flatten reader controls and open Markdown on GitHub ([b7d15bc](https://github.com/nocoo/ocelot/commit/b7d15bca517d77a48a17a3b7374e734f7122eb4b))
- restore public author profiles in Cloudflare Workers ([2da14ad](https://github.com/nocoo/ocelot/commit/2da14ad5e72e74b6ce26ce185b24cba0830da2a1))

### Maintenance

- feature the complete Ocelot artwork in the empty reader ([ac4a05d](https://github.com/nocoo/ocelot/commit/ac4a05daee4a43f0040e68aa6918d1aba16ed722))
- register isolated local ports and Caddy HTTPS ([22d652f](https://github.com/nocoo/ocelot/commit/22d652f72b939a9498861ebbbb58bc1b8d5af969))

### Documentation

- record profile deployment and minor release plan ([3187f1e](https://github.com/nocoo/ocelot/commit/3187f1e7ff2888c25d5853f724283227b6c09ee6))

## [0.1.0] - 2026-09-11

### Documentation

- establish Ocelot product and engineering contract ([c991b26](https://github.com/nocoo/ocelot/commit/c991b268082549d6bb5cc21c38535719dfd60b35))
- propose GitHub authentication and cache architecture ([8a4a150](https://github.com/nocoo/ocelot/commit/8a4a150e9cfb5adea0a67556376f98b6840bd956))
- accept PAT and define local reader implementation ([4667f92](https://github.com/nocoo/ocelot/commit/4667f92cf61a59c782ba2efd0c739b6f04fc9387))
- define Access identity and production delivery ([743350c](https://github.com/nocoo/ocelot/commit/743350c5586edaca42a263fef3a5db8293385011))
- record verified production delivery ([620607f](https://github.com/nocoo/ocelot/commit/620607f67de5f1e511366abf7297fe4af307b393))

### Features

- implement the read-only vault reader and local Cloudflare runtime ([40787ea](https://github.com/nocoo/ocelot/commit/40787ea5783e639a9ff2d9755bc5fdc5a5582528))
- adopt Ocelot family identity and bilingual readmes ([9d27eea](https://github.com/nocoo/ocelot/commit/9d27eea583794ccda07dd2454c2a40302f86e227))
- deliver Access profiles and versioned Cloudflare deployment ([a4ba4b7](https://github.com/nocoo/ocelot/commit/a4ba4b759b1843d60c45db559609a07bc5624e61))

### Maintenance

- enforce verification and document reader operations ([b2d89fd](https://github.com/nocoo/ocelot/commit/b2d89fd134464ab2812a08e6e46703c7cdddd44d))
- recognize the public Access audience identifier ([5874743](https://github.com/nocoo/ocelot/commit/5874743a4876544dfd2aa49adb9411be7ecb9b69))

### Fixes

- align Basalt navigation and reading chrome ([8875681](https://github.com/nocoo/ocelot/commit/8875681e705893181af21715edee51d418299d87))
- wait for the production domain before verifying delivery ([f8ffe14](https://github.com/nocoo/ocelot/commit/f8ffe14c0b9ac746b70f8400fa26e02d6c85aa4f))
- align sidebar branding with the Basalt template ([2837c87](https://github.com/nocoo/ocelot/commit/2837c8770c92f6487a948c19d44ee0315ddbfb99))
- keep the sidebar logo anchored during collapse ([efaacfe](https://github.com/nocoo/ocelot/commit/efaacfe89ddfd3029e326c33abcc1cf1c24f695e))
