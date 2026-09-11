# Ocelot

一处安静的私人阅读室。连接 GitHub 上的公开或私有 Obsidian 知识库，沿着目录、
双链和文章大纲阅读。源仓库始终只读。

Basalt **2.1.7** 提供控件与布局，Pierre Trees 提供虚拟化目录，排版借鉴
[Kami](https://github.com/tw93/Kami) 的中英文阅读节奏。冷蓝灰界面支持明暗主题、
移动端、键盘导航与减少动效。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/reader-dark.png">
  <img src="docs/assets/reader-light.png" alt="Ocelot 的目录、中文正文与文章大纲，使用合成示例知识库">
</picture>

## 本地体验

需要 Node.js 26、Bun 1.4.0：

```sh
bun install --frozen-lockfile
bun run dev
```

打开 **<http://127.0.0.1:5173>**。使用真实 Wrangler 本地 Worker、SQLite D1
和磁盘 R2，无需 PAT 或 Cloudflare 账户。开发数据保存在 `.wrangler/state`。

示例包含 3 个合成仓库、1,173 篇可见主库笔记、原创图片和两个 Git 版本。
侧栏的烧瓶按钮可以体验慢加载、到期提醒、凭据失效、限流、离线及新提交。
“我的知识库”支持添加第三个示例 `ocelot-demo/reading-room`。

## 阅读与同步

- GFM、frontmatter、Obsidian 双链/别名、标题和块锚点、callout、表格、代码、公式、Mermaid。
- 笔记嵌入与附件固定到同一 Git 版本；外部追踪图片与可执行内容被阻止。
- 文件名与路径搜索：⌘K / Ctrl+K。目录支持键盘选择、展开与变化标记。
- 按需缓存正文；可见时每 60 秒条件检查，隐藏时暂停。未更新时不重新传输目录。
- 更新由读者显式应用，保留当前位置与展开目录；慢加载期间保留原文。
- PAT 到期前 7 天轻量提醒；服务端轮换后重新检查即可继续阅读。

## 工程与验证

Vite + React + **TypeScript 7.0.2**，MVVM，Biome，Husky。Worker 使用
Cloudflare Access 验证身份，PAT 存放于 Worker Secrets；D1 保存元数据，
私有 R2 保存可重建缓存。

```sh
bun run check              # 类型、Biome、完整非 View 覆盖率、前端构建
bun run worker:check       # 生产 Worker dry run
bun x playwright install chromium
bun run test:e2e           # 独立 Wrangler + 生产前端的浏览器验收
```

本地验收：**145 项 UT、13 项浏览器测试通过**。非 View 代码包含 Worker 与未执行
源码，语句/分支/函数/行覆盖率分别为 **100% / 98.33% / 100% / 100%**。
浅色、深色和移动端 axe 扫描通过。详细证据与支持边界见 [05](docs/05-runtime-contract-and-verification.md)。

生产入口和配置已准备；**尚未部署**。需要实际域名、Access、D1/R2 与 PAT，
按 [06 · 运行与部署](docs/06-running-and-deployment.md) 配置。默认本地 mock 不连接真实 GitHub。

## 文档

- [00 · 项目状态与文档索引](docs/00-project-status.md)
- [01 · 产品与工程约定](docs/01-product-contract.md)
- [02 · GitHub 认证、缓存与更新](docs/02-github-auth-cache-and-sync.md)
- [03 · 类似项目调研](docs/03-reference-projects.md)
- [04 · 实现与本地验收](docs/04-implementation-and-local-testing.md)
- [05 · 运行契约与验收记录](docs/05-runtime-contract-and-verification.md)
- [06 · 本地运行、PAT 轮换与部署](docs/06-running-and-deployment.md)
- [开发协作约定](AGENTS.md) · [第三方说明](THIRD_PARTY_NOTICES.md)

在 `main` 上按可验证的结果做原子提交。公开仓库只保存应用与合成示例，
不保存私人笔记、真实仓库清单或运行凭据。
