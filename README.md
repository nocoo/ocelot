<p align="center">
  <img src="assets/brand/icon-rounded.png" width="128" height="128" alt="Ocelot：凝望彩色折纸鸟的碎片豹猫">
</p>

<h1 align="center">Ocelot</h1>
<p align="center">只读浏览 GitHub 上的公开和私有 Obsidian 知识库。</p>
<p align="center"><a href="https://ocelot.hexly.ai">站点</a> · <a href="docs/README.en.md">English</a></p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/reader-dark.png">
  <img src="docs/assets/reader-light.png" alt="Ocelot 的目录、中文正文与文章大纲，使用合成示例知识库">
</picture>

## 这是什么

一处安静的私人阅读室。连接 GitHub 上的公开或私有 Obsidian 知识库，沿着目录、
双链和文章大纲阅读。源仓库始终只读。

Basalt **2.1.8** 提供控件与布局，Pierre Trees 提供虚拟化目录，排版借鉴
[Kami](https://github.com/tw93/Kami) 的中英文阅读节奏。冷蓝灰界面支持明暗主题、
移动端、键盘导航与减少动效。

## 功能

- GFM、frontmatter、Obsidian 双链/别名、标题和块锚点、callout、表格、代码、公式、Mermaid。
- 笔记嵌入与附件固定到同一 Git 版本；外部追踪图片与可执行内容被阻止。
- 阅读器控件单独分组，直接切换全宽、字号与 Raw；长目录独立滚动，支持回顶与图片放大。
- 文件名与路径搜索：⌘K / Ctrl+K。目录支持键盘选择、展开与变化标记。
- 按需缓存正文；可见时每 60 秒条件检查，隐藏时暂停。未更新时不重新传输目录。
- 更新由读者显式应用，保留当前位置与展开目录；慢加载期间保留原文。
- PAT 到期前 7 天轻量提醒；服务端轮换后重新检查即可继续阅读。

## 使用

打开 [Ocelot](https://ocelot.hexly.ai)，通过 Cloudflare Access 登录，选择知识库并沿目录、双链与文章大纲阅读。实际知识库需要管理员将 GitHub PAT 配置为 Worker Secret `GITHUB_TOKEN`；本地演示使用合成数据，不连接真实 GitHub。详见[运行与部署](docs/06-running-and-deployment.md)。

## 开发

需要 Node.js 26.8.1、Bun 1.4.0：

```sh
bun install --frozen-lockfile
bun run dev
```

打开 **<https://ocelot.dev.hexly.ai/>**（[Caddy 配置](docs/11-local-https.md)，
直连诊断端口 `7049`）。使用真实 Wrangler 本地 Worker、SQLite D1
和磁盘 R2，无需 PAT 或 Cloudflare 账户。开发数据保存在 `.wrangler/state`。

示例包含 3 个合成仓库、1,177 篇可见主库笔记、原创图片和两个 Git 版本。
入口提供 48 章长文、144 项目录、各种比例的图片及 Markdown 图文排版样例。
右上角的烧瓶按钮可以体验慢加载、到期提醒、凭据失效、限流、离线及新提交。
“我的知识库”支持添加第三个示例 `ocelot-demo/reading-room`。

```sh
bun run typecheck
bun run lint
bun run build
bun run worker:check
```

发布、PAT 轮换及真实环境验收见[运行与部署](docs/06-running-and-deployment.md)。

## 测试

```sh
bun run test:coverage
bun x playwright install chromium
bun x playwright install webkit
bun run test:e2e
```

Vitest 检查非 View 逻辑与 Worker；Playwright 使用独立 Wrangler 和生产前端验证阅读、导航、鉴权、缓存与无障碍。历史结果和支持边界见[运行契约与验收记录](docs/05-runtime-contract-and-verification.md)。

## 技术栈

| 技术 | 用途 |
| --- | --- |
| React、Vite、TypeScript | MVVM 阅读器与前端构建 |
| Basalt、Pierre Trees | 控件、布局和虚拟化目录 |
| Cloudflare Workers、Access | API 与查看者身份校验 |
| D1、私有 R2 | 元数据与可重建缓存 |
| Biome、Vitest、Playwright | 静态检查、逻辑与浏览器验证 |

## 文档

- [00 · 项目状态与文档索引](docs/00-project-status.md)
- [01 · 产品与工程约定](docs/01-product-contract.md)
- [02 · GitHub 认证、缓存与更新](docs/02-github-auth-cache-and-sync.md)
- [03 · 类似项目调研](docs/03-reference-projects.md)
- [04 · 实现与本地验收](docs/04-implementation-and-local-testing.md)
- [05 · 运行契约与验收记录](docs/05-runtime-contract-and-verification.md)
- [06 · 本地运行、PAT 轮换与部署](docs/06-running-and-deployment.md)
- [07 · Basalt 导航与阅读界面](docs/07-basalt-navigation.md)
- [08 · 视觉规范](docs/08-visual-identity.md) · [品牌资产](assets/brand/README.md)
- [09 · 身份、版本与持续交付](docs/09-identity-and-delivery.md)
- [操作入口](AGENTS.md) · [版本变更](CHANGELOG.md)
- [开发协作约定](AGENTS.md) · [第三方说明](THIRD_PARTY_NOTICES.md)

## 许可证

仓库未提供项目级 LICENSE。第三方组件的许可见[第三方说明](THIRD_PARTY_NOTICES.md)。
