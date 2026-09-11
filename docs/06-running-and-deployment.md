# 06 · 本地运行、PAT 轮换与部署

状态：**本地流程与生产自动部署均已验证** · 2026-09-11

## 本地启动

使用 Node.js 26.8.1 与 Bun 1.4.0：

```sh
bun install --frozen-lockfile
bun run dev
```

打开 <http://127.0.0.1:5173>。Vite 提供前端热更新，API 代理到 `127.0.0.1:8787`
的 `wrangler dev --local`。退出时按 Ctrl+C。脚本先应用 D1 migrations，再幂等
写入合成种子；数据保存在 `.wrangler/state`。无需 Cloudflare 登录、PAT 或远程数据库。
启动脚本等待 Worker 的 session API 就绪后才启动 Vite，避免首个页面请求早于后端。

本地默认登记 `ocelot-demo/fieldnotes` 与 `ocelot-demo/studio-notes`。
在“我的知识库”里添加 `ocelot-demo/reading-room` 可以体验第三个私有仓库。
默认 mock 只支持这些合成仓库；输入真实 GitHub 地址不会请求真实 GitHub。

右上角的烧瓶按钮打开“本地体验场景”，旁边的 GitHub 图标打开源码仓库。
左下角本地保留合成阅读室身份；线上改为经过 Access 验证的用户姓名与头像。

| 场景 | 体验方式 |
| --- | --- |
| 正常阅读 | 浏览目录、双链，或按 ⌘K / Ctrl+K 搜索文件名与路径 |
| 慢速加载 | 打开未读过的笔记；旧文章保留，顶部细线显示下一篇的准备过程 |
| 3 天后到期 | 侧栏出现轻量提醒，连接面板展示日期与轮换说明 |
| 凭据失效 | 当前文章保留，新的私有缓存读取被拒绝 |
| GitHub 限流 | 检查按钮等待 `Retry-After`，避免重复请求 |
| 上游离线 | 显示连接状态；权限复核过期后暂停新的内容读取 |
| 收到新提交 | 工具栏提示 3 份文件变化；应用后新增、修改、删除分别反映到目录 |

从失效或离线场景切回“正常阅读”会重新检查连接。面板中的请求计数可用于观察
`head`、`not-modified`、`tree`、`blob`：反复读同一内容不会重复下载 blob。
场景切换不会清空缓存；要观察慢请求，选择一篇尚未打开的档案笔记。

修改 `fixtures/notes/` 后运行 `node scripts/generate-fixtures.mjs` 重建确定性的
Git tree/blob 数据。脚本和示例均不读取私人 Obsidian 仓库。

## 本地验收

```sh
bun run check
bun run worker:check
bun x playwright install chromium
bun run test:e2e
bun run check:security
```

`check` 包含类型、Biome、非 View 完整覆盖率和生产前端构建。`worker:check`
只打包生产 Worker，不部署。Playwright 会构建前端，在 `5174 / 8788` 启动
Vite preview 与独立 Wrangler，并重建 `.wrangler/e2e`；不会清空开发数据库。
不要同时启动两次浏览器验收，因为端口与测试数据库固定。

覆盖率报告在 `coverage/index.html`，浏览器报告在 `playwright-report/index.html`，
截图和失败 trace 在 `test-results/`。这些运行产物被 Git 忽略。
CI 使用 Linux Chromium，安装浏览器时附加 `--with-deps`。

Husky 提交前检查暂存文件的 Biome 与项目类型，推送前检查覆盖率；CI 还运行
浏览器、Worker 打包，以及 `bun run types` 后生成文件的一致性检查。
更改 `wrangler.jsonc` 的 bindings 后重新运行 `bun run types` 并提交生成文件。
`types` 使用空的 `.dev.vars.example` 声明 Secret 名称，避免生成结果依赖个人
凭据；该文件不参与部署。OSV Scanner 2.5.1、Gitleaks 8.30.1 需在本机安装；
CI 下载固定版本并核对 SHA-256。扫描不忽略已知漏洞或真实秘密。

## 生产配置与自动部署

生产入口为 `worker/index.ts`，默认 mock 入口为 `worker/local.ts`。
使用 `wrangler.jsonc` 部署；不要将 `wrangler.local.jsonc` 用于生产。
以下值已写入 `wrangler.jsonc`：

| 配置 | 值 |
| --- | --- |
| `account_id` | `d51a8fde361e4be31db17d8c56737c1f` |
| 自定义域名 | `ocelot.hexly.ai` |
| `vars.ACCESS_TEAM_DOMAIN` | `https://nocoo.cloudflareaccess.com` |
| `vars.ACCESS_AUD` | `9ae6de1c823b3d81d5332533d40024ddee04eb692b9e33b068c4071c64154798` |
| `vars.OWNER_EMAIL` | `architie@gmail.com`，沿用同一用户其他项目的邮箱 |
| D1 | binding `DB`，数据库名 `ocelot` |
| R2 | binding `CACHE`，私有桶 `ocelot-private-cache` |
| `vars.GITHUB_TOKEN_EXPIRES_AT` | 可选 ISO 8601 到期时间；GitHub 返回日期优先 |

GitHub Actions 的仓库 Secret **`CLOUDFLARE_API_TOKEN`** 已由用户保存。
它仅用于 Ocelot 的 Cloudflare 部署，不是访问知识库的 GitHub PAT。
权限及版本规范见 [09](09-identity-and-delivery.md)。

向 `main` 推送后，`Verify & Deploy` 先验证类型、Biome、完整覆盖率、前端与
Worker 打包、Chromium 流程，以及 OSV/Gitleaks。只有可信仓库的 main 可以
进入串行的 Deploy job；PR 不获得部署凭据。部署前拒绝已被更新 main 取代的提交。

`bun run deploy` 先检查账号与 owner，按名称查找 D1，仅在不存在时创建
`ocelot`（APAC location hint），然后应用远程 migrations。锁定的 Wrangler
4.131.0 支持按名称解析 D1，无需占位 UUID；部署时原生复用或创建指定 R2 桶。
R2 不启用 `r2.dev` 或公开域名。生产只运行 migrations，不导入 `fixtures/seed.sql`。

随后上传前端与 Worker，写入 `vX.Y.Z-完整GitSHA` 部署标签。验证脚本核对
100% 流量所用的 Worker 版本与标签，并检查匿名请求跳转到 nocoo Access。
首次 DNS 或边缘尚未就绪时，网络错误/5xx 最多重试 12 次、间隔 10 秒；出现
公开页面或错误跳转立即失败，耗尽等待也不会标记为部署验证成功。
这不代替真实 Access 会话与私有知识库的端到端验收。

保留 `assets.run_worker_first: true`、`workers_dev: false`、`preview_urls: false`。
认证覆盖 HTML、静态资源、API 与附件，不为这些路径添加 Access Bypass。
Worker 同时验证 JWT 签名、issuer、audience、有效期、应用类型和 owner email。
Access Self-hosted application 应覆盖整个域名，Allow policy 限定本人邮箱。

## 版本与 release

根 `package.json` 是版本唯一来源：侧栏显示 `vX.Y.Z`，受保护的 `/api/live`
返回 `X.Y.Z` 和 Cloudflare 版本信息。按以下流程从干净的 main 发布：

```sh
bun run release -- --dry-run
bun run release
# 或显式选择：bun run release -- patch / minor / major / 1.2.3
```

首次沿用未发布的 `0.1.0`。之后默认 patch；距前次发布超过 3 天或累计 diff
超过 500 行自动 minor。dry run 不安装、不 fetch、不写文件、不改 refs。
实际发布更新 CHANGELOG 和版本，保留 hooks，推送后等待该提交的 push CI/CD；
Deploy 成功才创建不可变 annotated tag 和 GitHub Release。

如果只是 CD 凭据修复，先重跑对应提交失败的 push workflow，再用同一个显式
版本重试；不能以手动 workflow 的成功替代脚本要求的 push run，也不移动已发布 tag。
`bun run verify:production` 可重新核对当前 Git revision 的控制面版本与 Access
跳转，需要有效的 Cloudflare 登录或部署 token，不需要知识库 PAT。

## PAT 权限与首次配置

在 GitHub 的 **Fine-grained personal access tokens** 创建凭据：

1. Resource owner 选择知识库所在用户。
2. Repository access 选择需要阅读的仓库。
3. Repository permissions 只授予 **Contents: Read-only**；Metadata 随基本权限提供。
4. 设置明确的到期日。

通过交互式 Secret 输入配置 PAT，避免把 token 写进命令参数、Git 文件或前端环境变量：

```sh
bun x wrangler secret put GITHUB_TOKEN
```

也可在 Cloudflare Dashboard → Workers → `ocelot` → Settings → Variables and
Secrets 添加名为 `GITHUB_TOKEN` 的 **Secret**。不要用 GitHub Actions 同名的
内置 token：它不代表选定私人知识库的授权。

首次上线允许没有 PAT 的空阅读室；身份、头像和版本仍可加载，GitHub 操作
会明确拒绝缺失凭据。当前尚未提供实际 PAT。配置 Secret 后，后续 Wrangler
部署会保留它；补充到期日写入 `GITHUB_TOKEN_EXPIRES_AT` 后通过 CD 发布。
登录受保护域名后，在应用内添加 `owner/repo` 或 GitHub 仓库 URL。
登记不会扩大 PAT 权限；新增未授权仓库时，先在 GitHub 更新其授权范围。

默认本地 demo 无需 `.dev.vars`，不要为它放入真实 PAT。该文件仅供独立配置真实生产入口的本地调试，
需要同时提供实际 Access 配置和有效 JWT；不在生产入口增加认证旁路。

## 日常轮换

侧栏在已知到期日之前 7 天提醒。若 GitHub 未提供日期且没有补充配置，面板
如实显示“暂未提供”。更新步骤：

1. 在 GitHub 创建替代 fine-grained PAT，保持必要的选定仓库只读权限。
2. 再次运行 `bun x wrangler secret put GITHUB_TOKEN`。
3. 使用补充到期值时更新 `GITHUB_TOKEN_EXPIRES_AT` 并重新部署配置。
4. 回到“阅读连接”，点击“重新检查”，确认可以继续读取知识库。
5. 在 GitHub 撤销旧 PAT。

无需重新添加知识库。获知凭据失效时，服务端停止新的缓存响应；已经显示在浏览器
里的文章继续保留。限流或网络故障使用独立状态，不提示用户无故更换 PAT。

## 上线验收与当前边界

当前已验证本地 mock、真实 Workers 测试运行时、SQLite D1/R2、作者资料和生产
打包；远程 D1/R2 创建、迁移、部署、Git 版本与 Access 入口均已通过，证据见 09。
真实 PAT 尚未提供；配置后仍需验收本人登录、非本人拒绝、私有笔记/图片保护，
以及轮换后读取选定真实仓库的完整流程。无 JWT 的应用层拒绝已由 Worker 测试覆盖。

首版使用默认分支、文件名/路径搜索及浏览器渲染；不做全文索引、离线持久存储
或自动 PAT 续期。正文/附件大小、树容量、嵌入和保留边界见
[05 · 运行契约与验收记录](05-runtime-contract-and-verification.md)。
