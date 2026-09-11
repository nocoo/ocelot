# 06 · 本地运行、PAT 轮换与部署

状态：**本地流程已验证；生产部署待配置** · 2026-09-11

## 本地启动

使用 Node.js 26 与 Bun 1.4.0：

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

侧栏底部的烧瓶按钮打开“本地体验场景”：

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

## 生产准备

生产入口为 `worker/index.ts`，默认 mock 入口为 `worker/local.ts`。
使用 `wrangler.jsonc` 部署；不要将 `wrangler.local.jsonc` 用于生产。
当前生产文件保留占位值；Access 未配置时 Worker 拒绝响应受保护内容。

先创建资源，将实际 D1 UUID 写入配置。R2 桶保持私有，不启用 `r2.dev` 或公开域名：

```sh
bun x wrangler d1 create ocelot
bun x wrangler r2 bucket create ocelot-private-cache
```

在 Cloudflare Zero Trust 建立 Self-hosted Access application，域名覆盖整个
Ocelot 站点与所有路径。Allow policy 只允许自己的 email；记录该应用的 AUD。
在 `wrangler.jsonc` 填入：

| 配置 | 值 |
| --- | --- |
| `d1_databases[0].database_id` | 创建数据库返回的真实 UUID |
| `vars.ACCESS_TEAM_DOMAIN` | `https://<team>.cloudflareaccess.com`，无末尾 `/` |
| `vars.ACCESS_AUD` | Access 应用的 audience tag |
| `vars.OWNER_EMAIL` | 被允许访问的单一 email |
| `vars.GITHUB_TOKEN_EXPIRES_AT` | 可选 ISO 8601 到期时间；GitHub 返回日期优先 |
| `routes` | `[ { "pattern": "你的实际域名", "custom_domain": true } ]` |

保留 `assets.run_worker_first: true`、`workers_dev: false`、`preview_urls: false`。
认证覆盖 HTML、静态资源、API 与附件，不为这些路径添加 Access Bypass。
Worker 同时验证 JWT 签名、issuer、audience、有效期、应用类型和 owner email。

## PAT 权限与首次配置

在 GitHub 的 **Fine-grained personal access tokens** 创建凭据：

1. Resource owner 选择知识库所在用户。
2. Repository access 选择需要阅读的仓库。
3. Repository permissions 只授予 **Contents: Read-only**；Metadata 随基本权限提供。
4. 设置明确的到期日。

通过交互式 Secret 输入配置 PAT，避免把 token 写进命令参数、Git 文件或前端环境变量：

```sh
bun x wrangler secret put GITHUB_TOKEN
bun x wrangler d1 migrations apply ocelot --remote
bun run build
bun x wrangler deploy
```

首次部署时若 Worker 尚不存在，Wrangler 的 Secret 流程会引导创建。
生产只运行 migrations；不要向远程 D1 导入 `fixtures/seed.sql`。
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

当前已验证本地 mock、真实 Workers 测试运行时、SQLite D1/R2 与生产打包。
尚未使用真实 PAT、远程 D1/R2、Access 策略或实际域名完成部署验收。
实际上线时验证本人登录、非本人和无 JWT 拒绝、私有笔记及图片的登录保护、
备用入口关闭，以及轮换后读取选定真实仓库的完整流程。

首版使用默认分支、文件名/路径搜索及浏览器渲染；不做全文索引、离线持久存储
或自动 PAT 续期。正文/附件大小、树容量、嵌入和保留边界见
[05 · 运行契约与验收记录](05-runtime-contract-and-verification.md)。
