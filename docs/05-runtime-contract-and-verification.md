# 05 · 运行契约与验收记录

状态：**本地与远程交付验收通过；真实知识库待 PAT** · 2026-09-11

## 已实现的边界

- PAT 仅进入服务端 GitHub 请求；所有源仓库操作都是 GET。API 使用 Access
  JWT 的签名、issuer、audience、有效期和 owner email 验证单用户身份。
- 仓库以 GitHub 数字 ID 登记。快照登记在 D1，目录和按需读取的 blob 存入私有
  R2。正文、图片与笔记嵌入均固定到当前阅读版本。
- GitHub 权限复核窗口为 60 秒。获知凭据失效后立即停止新的缓存响应；超出窗口
  且无法重新验证权限时也停止响应。已经显示的文章继续保留。
- D1 条件 lease 防止并发检查互相覆盖。完整目录缓存成功后才发布快照；旧请求
  丢失 lease 时不能写入当前版本。
- 前台每 60 秒检查一次，隐藏页面暂停；恢复可见时按需检查。HEAD 使用 ETag。
  客户端传入已知 tree SHA，未变化时 API 仅返回仓库状态，避免重复传输整个目录。
- GitHub 限流统一遵守 `Retry-After` / reset 时间，手动检查也不会绕过等待期。

## 当前容量与兼容性

| 项目 | 边界 |
| --- | --- |
| Markdown 正文 | 每份最多 2 MiB |
| 图片 / 音视频 / PDF 附件 | 每份最多 15 MiB；PDF 下载阅读 |
| 知识库 | 最多 20,000 个文件 |
| GitHub 递归目录截断 | 逐目录补全，最多 256 个目录、60 秒 |
| 笔记嵌入 | 每篇最多 8 个唯一目标，单层文本/章节预览，链接打开完整笔记 |
| 隐藏文件、符号链接、子模块 | 不进入可读目录 |
| SVG、HTML 文件、Git LFS 对象 | 不作为可执行附件提供 |
| 外部图片 | 不自动请求，避免向第三方暴露阅读活动 |
| 搜索 | 当前知识库的文件名与路径；不提前下载全文建立索引 |
| 缓存保留 | 30 天；可从 GitHub 重建；移除登记后清理对应 R2 前缀 |

## 本地隔离

`wrangler.local.jsonc` 指向专用 local 入口。只接受 loopback 主机；仅在这个入口
恢复已知 Vite 开发端口的 Origin，再执行共用 CSRF 检查。生产入口不导入 local
入口、mock 或合成知识库。开发数据在 `.wrangler/state`；浏览器验收单独使用
`.wrangler/e2e`，不会清空开发者的本地阅读状态。

Mock 由确定性脚本生成：3 个仓库、主仓库 1,176 个原始文件（过滤后 1,173 篇
Markdown）、两个 Git 版本、原创 PNG 附件。所有内容与路径均为合成数据。

## 验收记录

- 交互验收约定：发现新提交只改变工具栏的更新入口与状态文案，不挤动正文；
  显式应用后保留当前文章的滚动位置与目录展开状态。切换文章、知识库及添加
  知识库时，迟到的请求不能覆盖更近一次操作。
- 浏览器验收使用生产前端 bundle 与独立 Wrangler 本地 SQLite / R2，覆盖中英
  阅读、富文本安全、目录键盘操作、PAT 轮换、慢加载、限流、离线与版本交接；
  浅色、深色及移动端均检查无障碍与页面溢出。
- 工程门禁：Husky 提交前检查暂存文件的 Biome 与项目类型，推送前检查完整
  非 View 覆盖率；CI 另外校验生成的 Worker 类型、构建、Worker dry run 和浏览器。
  验证 job 只使用合成数据，不获得 GitHub PAT 或 Cloudflare 部署凭据；CD Token
  只进入所有验证通过后的部署步骤。OSV / Gitleaks 同时作为部署门禁。
- 工具版本已固定：Basalt 2.1.7、TypeScript 7.0.2；Cloudflare 当前测试插件
  `@cloudflare/vitest-plugin` 1.1.7 与 Wrangler 4.131.0 使用同版本 Miniflare。
- `bun run typecheck`、`bun run lint` 通过。
- `bun run test:coverage`：**10 个测试文件，163 项通过**；语句 **100% (1054/1054)**、
  分支 **98.62% (860/872)**、函数 **100% (191/191)**、行 **100% (936/936)**。
  统计包含未执行的 Models、ViewModels、services、Worker 与 mock；只排除
  `src/views/`、单独的 bootstrap `src/main.tsx` 及生成/声明类型。发布决策模型
  也计入覆盖率；CLI 另以临时 Git 仓库和可控命令验证 dry run 与部署顺序。
- 覆盖真实 Worker/D1/R2 的授权窗口、缓存命中、304、版本固定、lease 丢失、
  截断目录补全、撤销权限、限流、30 天清理及 501 对象的分页删除。
- Playwright：**17 项 Chromium 流程通过**，使用生产前端与独立 Wrangler，
  本轮约 22 秒。验证中英文、深链接/历史、目录键盘、千篇搜索、富文本、
  私有仓库管理、慢加载、PAT 轮换/失效、更新不挤动正文及目录展开保留。
  补充完整路径、目录定位、菜单焦点、11px 最小字号和目录行距检查，见 07。
  新增资料延迟不阻塞阅读、线上隐藏本地入口、头像失败回退、版本与顶部入口，
  并验证明暗主题下侧栏与 header 的背景完全相同。并行品牌任务占用默认测试
  端口，本轮独立使用 5184/8789 与专用测试状态；CI 仍使用标准 5174/8788。
- 上线前品牌区按 Surety 固定起点：24 个明暗/动效/侧栏宽度场景、960 个采样帧
  中 logo 位置与尺寸不变；4 项现有相关浏览器流程再次通过，用户已确认，见 07。
- 浅色、深色、390 × 844 移动端 axe 扫描 **0 violations**；检查截图、横向溢出、
  弹层焦点恢复与 reduced motion。浏览器测试无未处理的页面异常。
- `bun run check:security`：OSV 2.5.1 和 Gitleaks 8.30.1 通过。已修复 Mermaid
  间接依赖中的 lodash-es 已知漏洞，并验证 Mermaid 实际渲染。
- `bun run build`、`bun run worker:check` 通过。生产 Worker **65.45 KiB / gzip 18.08 KiB**，
  打包入口不包含 mock 数据。Mermaid 按需加载；前端仍有大于 500 kB 的 JS chunk
  构建提示，首屏与低端移动设备的网络性能需要在真实部署后进一步测量。
  首次 Linux CD 上传记录为 **65.45 KiB / gzip 18.20 KiB**，启动时间 **4 ms**。

报告位置：`coverage/`、`playwright-report/`、`test-results/`；它们是本地生成
产物，不进入公开 Git。GitHub Actions 已配置，远程执行状态以仓库运行记录为准。

生产的账号、域名、Access team/audience/owner 已写入配置，CD Token 已保存。
D1 已按名称创建并完成迁移，私有 R2 由 Wrangler 原生配置；后续 CD 成功复用
资源，并核验完整 Git 标签与 Access 入口，实际结果见 09。
尚未提供真实 GitHub PAT 或完成私有知识库线上验收。
