# 09 · 身份展示、版本与持续交付

## Shared delivery migration (2026-09-12)

Status: Actionlint and current-tree/full-history Gitleaks passed; remote
verification is pending this commit's CI and Release runs.

CI and Release inherit the pinned `base-ci` v2026.7 workflows. Quality retains
type generation checks, lint, type checking, coverage, build, Worker dry run,
and required security scans. A separate shared test job runs Chromium and
uploads its HTML report and failure diagnostics from the job that produces
them; the coverage job retains its own report. The build job must not upload
coverage or browser reports created on other runners.

The public Cloudflare Access audience is verifier metadata. The Gitleaks
configuration allows only its exact `ACCESS_AUD` assignment in `wrangler.jsonc`
and preserves all default credential detectors. The historical fingerprint
remains limited to its original commit. Release verifies the successful CI
source and current main commit before using the production environment.

状态：**生产 PAT 已恢复为 Secret；状态修复已通过本地回归** · 2026-09-11

## 用户要求

- “本地体验场景”移到右上角，右上角加入指向 `nocoo/ocelot` 的 GitHub 图标。
- 左下角继续使用 Basalt `SidebarUser`；线上显示 Access 用户的姓名、头像，
  本地保留合成阅读室身份。参考其他项目的 lizheng.blog 作者服务。
- Access team 为 `nocoo`，AUD 为
  `9ae6de1c823b3d81d5332533d40024ddee04eb692b9e33b068c4071c64154798`；
  正式域名为 `ocelot.hexly.ai`。单用户邮箱暂沿用其他项目的
  `architie@gmail.com`，已向用户说明这一默认值；不同邮箱仍被拒绝。
- 增加版本管理、release、CI/CD 和 `CLAUDE.md`。查 nmem 并对齐其他项目。
- CD 配置准备后说明密钥名称，并用 Chrome 打开设置页面。

## 依据

- nmem `f1ee6f38-dc59-4f41-83c8-2a2663f32c31`：根 `package.json` 为版本
  唯一来源；维护 `X.Y.Z`，展示 `vX.Y.Z`；侧栏站名旁等宽 Pill；`/api/live`。
  默认 patch，距上次发布超过 3 天或累计 diff 超过 500 行时自动 minor 并清零
  patch；支持显式 patch/minor/major/版本和只读 dry run。
- nmem `crystal_593c53e01949`、`crystal_0c9c31f7de97`：编号文档、变更日志、
  不可变 tag/GitHub Release、迁移检查、远程 CI/CD 验收。
- 只读参考 `../hexly.ai/scripts/release{,-model}.ts`、`docs/05-release.md` 和
  CI：发布提交的验证及部署成功后再创建 tag/Release，不用本地通过代替远程结果。
- 只读参考 Fundly / Dove 的 `author-profile.ts` 与 Firefly 的 profile API：
  `SHA-256(email.trim().toLowerCase())` →
  `https://lizheng.blog/api/authors/profile?hash=…`，返回 `{ name, avatar }`。
  Ocelot 只使用经过 JWT 校验的邮箱，不照搬参考项目里的 JWT decode 回退。
- Cloudflare 2026-09-11 当前文档：
  [JWT 验证](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)、
  [Wrangler 配置](https://developers.cloudflare.com/workers/wrangler/configuration/)、
  [版本与部署](https://developers.cloudflare.com/workers/versions-and-deployments/)、
  [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)。

## 实现约定

### 阅读界面与身份

- 顶部使用 Basalt Button，GitHub 链接新页打开并有明确的可访问名称；本地
  Flask 入口只出现在本地 session。移动端仍保留所有操作，正文与路径不溢出。
- 服务端校验 Access 的签名、issuer、audience、过期时间、app 类型和 owner
  后才返回身份。作者服务只接收邮箱哈希，不接收邮箱、JWT、PAT。
- 资料请求设置超时、响应体大小限制和可选缓存；资料不可用时回退到登录身份，
  不阻止阅读。头像失败显示稳定的 Basalt Avatar 回退，身份区不跳动。
  线上运行时兼容性和缓存不可用时的恢复修复见 [12](12-author-profile-recovery.md)。
- `/api/profile` 在阅读启动后独立加载；`/api/avatar` 根据已验证身份代理作者
  头像，两者均先经过 Access。2026-09-11 实测服务返回 `https://b.no.mt` 的
  头像，代理固定该 origin、拒绝重定向，仅接受有大小上限的光栅图片。
- 文章的任意外部图片继续受现有边界保护；作者头像只允许已验证的 HTTPS
  资源，避免为一个头像放宽所有笔记内容的 CSP。
- 本地身份与 profile 测试使用合成数据，不调用真实作者服务。

### 版本与发布

- 根 `package.json` 提供前后端版本；侧栏 Pill 至少 11px，支持折叠状态。
  `/api/live` 返回版本及部署信息，同样受 Access 保护，不建立公开认证旁路。
- release 从干净的 `main` 执行，检查 origin、版本合法性、远程同步与已存在
  的 tag；生成 CHANGELOG，保留 hooks，推送后等待对应提交的全部 CI/CD。
- CI 部署验证控制面中的版本与 Git SHA，并验证公开域名进入 Access 登录。
  没有生产 Access 会话时不伪称已经验收真实私有仓库阅读。
- dry run 不安装、不 fetch、不写文件、不改 refs、不发布。失败后保留未发布
  版本供修复重试；已经发布的 tag 不移动、不覆盖。

### 配置与 CI/CD

- 使用同一账号的公开配置 ID `d51a8fde361e4be31db17d8c56737c1f`，依据
  `../gaga`、`../coffee`、`../pokepocket` 的 Wrangler 配置；部署前由 API 核验。
- 单一 GitHub Actions secret：`CLOUDFLARE_API_TOKEN`。限制账号范围；权限为
  Workers Scripts / D1 / Workers R2 Storage 编辑、Account Settings 读取，
  `hexly.ai` Zone 读取及 Workers Routes 编辑。Cloudflare Token 和 GitHub
  Secret 设置页已按用户要求在 Chrome 打开；不记录值。
- GitHub 仓库 PAT 独立存放在 Worker `GITHUB_TOKEN` Secret；不作为构建变量。
  创建资源、迁移、部署只针对 Ocelot；私有 R2 不开启公开访问。
- 用户已保存 CD Token，并明确授权创建 D1 / R2 和发布 Worker。首次发布允许
  尚未提供 PAT 的空阅读室启动；GitHub 访问仍拒绝缺失凭据，不写入虚假 token，
  也不改为匿名访问。资料、头像和版本不依赖 GitHub PAT。
  `.dev.vars.example` 只为 `wrangler types --env-file` 提供 Secret 名称，值为空；
  它不参与部署，真实值后续通过 Worker Secret 配置并在部署之间保留。
- 沿用锁定的 Bun/Node/依赖和现有类型、Biome、≥95% 覆盖率、Worker dry run、
  Playwright 检查；补齐发布脚本、身份接口、版本一致性和安全检查。
- OSV 实测发现 Mermaid → Chevrotain 将 `lodash-es` 固定在有已知漏洞的
  4.17.23（GHSA-f23m-r3pf-42rh、GHSA-r5fr-rjxr-66jc）。将该间接依赖统一
  到已修复的 4.18.1，并回归图表渲染；不忽略漏洞。上游解除旧版精确依赖后
  可以移除这项 override。
- 仅可信 `main` 在所有检查成功后部署，部署串行，部署前拒绝已被 main 取代
  的提交。测试 job 不获得 Cloudflare Token 或 GitHub PAT。
- 保留 `workers_dev: false`、`preview_urls: false`、`run_worker_first: true`；
  自定义域名进入同一个 Access 校验，前端及 Worker 原子上传。
- `CLAUDE.md` 记录工程约定与命令，并引用 `AGENTS.md`、编号文档、配置和
  实际门禁，避免重复维护互相冲突的规则。

## 验收记录

本轮文档先于实现写入。并行品牌更新已将 08 用于视觉规范，因此本文件顺延为
09；保留已发布的品牌图、双语 README 和导航修正。

- 类型、Biome、构建和覆盖率检查通过：163 项 UT，语句/分支/函数/行覆盖率
  分别为 100% / 98.62% / 100% / 100%；完整分母见 05。
- 独立 Wrangler SQLite/R2 + 生产 bundle 的 17 项 Chromium 流程通过；包含
  头像延迟/失效、顶部入口、版本号、同色侧栏/header、明暗主题与移动端 axe。
  合入已发布的新品牌后，受影响的 7 项浏览器流程再次通过，并刷新三张截图。
- `bun run worker:check` 通过，65.45 KiB / gzip 18.08 KiB。
- OSV 2.5.1、Gitleaks 8.30.1 通过；workflow YAML 已解析并核对部署依赖。
  提交后全历史扫描将公开的 Access AUD 识别为 Generic API Key。AUD 是验证
  JWT 的公开应用标识，不能独立登录；`.gitleaksignore` 仅记录该提交、文件、
  行号和规则的精确 fingerprint，不排除整份配置、其他提交或实际凭据。
- 只读 release 预检及临时 Git 仓库测试通过；部署编排测试验证先迁移后部署、
  已有资源复用、迁移失败停止发布和账号检查。

首次 [CD](https://github.com/nocoo/ocelot/actions/runs/34598547645) 已通过全部
Verify / Security，创建 APAC D1 `39b12de7-4b0d-4e30-b212-c28fd43a44a0` 并执行
`0001_reader.sql`；创建 `ocelot-private-cache`，部署 Worker 版本
`1d4ec61f-1b32-4576-a446-b98df21e3b3f`。控制面版本与 Git 标签检查已通过，
随后匿名域名验证遇到首次 DNS 尚未生效的 `ENOTFOUND`，因此 Deploy 正确失败。

改进约定：域名探测对网络失败和 5xx 最多尝试 12 次，间隔 10 秒；非 Access
的成功页面、错误跳转或拒绝响应立即失败。不能把等待结束当作验证通过，也不
因为 Worker 已上传就创建 Release。后续控制面与域名检查均已成功，结果如下。

## 生产交付结果

- 用户已确认 07 中的最终 sidebar 修正。对应提交
  `efaacfe89ddfd3029e326c33abcc1cf1c24f695e` 的
  [push CI/CD](https://github.com/nocoo/ocelot/actions/runs/34600573634)
  **Verify / Security / Deploy 全部成功**；此前
  [2837c87 的交付](https://github.com/nocoo/ocelot/actions/runs/34599998095)
  也已通过完整版本与域名核验。
  本次校验的 Worker 版本为 `2339b8e4-f478-4bdf-b0b5-28e07600ff99`。
- D1 `ocelot`：`39b12de7-4b0d-4e30-b212-c28fd43a44a0`，APAC，
  `0001_reader.sql` 已应用；私有 R2 `ocelot-private-cache` 已创建。
  后续发布按名称复用资源，不导入本地合成种子。
- `https://ocelot.hexly.ai` 已启用；部署脚本验证 100% 流量使用对应完整 Git
  标签的版本，并成功进入 `nocoo.cloudflareaccess.com` 的 Access 登录。
- 额外匿名探测：`/`、`/api/session`、`/api/repositories`、`/logo-80.png`
  返回 Access 登录的 302；`/api/live` 返回应用层 `401 access_required`，
  未公开版本信息。测试使用公共 DNS 返回的地址且保留 HTTPS 主机名与证书验证；
  本机 DNS 当时仍缓存新域名的 NXDOMAIN，未修改系统 DNS 设置。
- 发行版本与最终发布提交以 [GitHub Releases](https://github.com/nocoo/ocelot/releases)
  中的不可变 tag 为准。release 脚本在该提交的 push CI/CD 成功后创建 tag，
  并在 Release 正文附上匹配的验证链接；不把以上先行部署当作最终发行提交。

用户已配置 GitHub vault PAT 并检测成功，随后反馈添加知识库后侧栏持续加载。
首次凭据配置问题已按下述记录恢复。真实本人/非本人登录、私有笔记
与附件、PAT 轮换的完整线上验收仍需实际 Access 会话和 PAT，当前未宣称完成。

## 首次接入故障：普通变量被发布配置覆盖

状态：**凭据已恢复；界面和状态修复本地通过，交付结果见对应 main CI/CD**。2026-09-11 12:51:55 UTC 的 Dashboard 版本将
`GITHUB_TOKEN` 保存为 `plain_text`；12:52:04 UTC 连接检测成功。12:53:52 UTC
的 Wrangler 发布按仓库中的 `vars` 更新普通变量，当前版本不再包含该项；
Secret 列表为空。生产 D1 只读查询确认登记仓库和目录快照均为 0，没有同步任务。
检查只输出绑定名称、类型和统计信息，没有输出凭据或私有笔记。

修复约定（操作前记录）：

- 将此次 Dashboard 版本中已配置的同一凭据迁移到 `GITHUB_TOKEN` Worker Secret。
  仅在内存中读取并通过标准输入交给 Wrangler，不写入文件、命令参数或日志。
  操作前确认线上尚无同名 Secret 且版本没有被用户更新；不覆盖后续用户配置。
- 不使用 `keep_vars` 保留所有 Dashboard 变量；Access 等普通配置仍以仓库为准，
  PAT 则使用原有的 Secret 保留机制。
- 缺少当前 PAT 时，连接接口立即返回 invalid，不沿用 D1 的旧 healthy 状态。
- 修复 07 记录的无请求骨架屏，使空目录、失败和实际加载有明确区别。
- 覆盖旧 healthy + 当前无凭据的 Worker 回归，以及空目录和失败后的浏览器流程。

实际结果：同一凭据已写入 `GITHUB_TOKEN`，线上查询确认类型为 `secret_text`，
该凭据访问 GitHub `/user` 返回 200。凭据不进入源代码、公开输出或测试数据。
连接状态回归与 07 的浏览器流程均通过；非 View UT 共 164 项，四项覆盖率为
100 / 98.62 / 100 / 100%。本次没有改变同步算法或扩大凭据权限。

## v0.2.0 发行约定（2026-09-12）

用户明确要求 `su-release Y+1`，接受本次 minor 发行 `v0.1.0 → v0.2.0`，
patch 归零。已读取本机 `su-release` 命令与 nmem 版本流程，并以现有
`scripts/release.ts` 执行版本、CHANGELOG、锁文件、提交、匹配 CI/CD、
不可变 annotated tag 和 GitHub Release；发布后 5 分钟再次核对 CI 与部署。

发行前已核查：根 `package.json` 为唯一版本来源，侧栏 Pill、`/api/live`、
Worker 部署标签和验证脚本均直接引用它。旧版本仅出现在历史记录与隔离的
发布算法测试中，无需改写。`bun run release -- --dry-run minor` 确认目标
为 `v0.2.0`。本次包含 10 的阅读器交互、11 的本地 HTTPS 和 12 的线上资料恢复。

12 的修复已随 `2da14ad` 通过完整 CI/CD 并部署；发行提交将单独通过完整
Verify / Security / Deploy 后才创建标签。
最终版本及发布证据以 [v0.2.0 Release](https://github.com/nocoo/ocelot/releases/tag/v0.2.0)
附带的匹配 CI/CD 链接为准。

发行结果：`v0.2.0` annotated tag 与正式 GitHub Release 均已发布，固定指向
`6abc940af080598dea319ec865ad32c0227bd6ca`。
[该提交的 CI/CD](https://github.com/nocoo/ocelot/actions/runs/34653096481)
Verify / Security / Deploy 全部成功；独立生产复查确认 `v0.2.0`、同一 Git SHA、
Worker `9c040a12-eca7-43c5-9c29-4ebb8aac52e3` 与 Access 登录边界。
本地 HTTPS `/api/live` 同样返回 `0.2.0`。首次创建 Release 遇到 GitHub 连接
重置，已按恢复约定从现有标签完成创建，未改写标签或再次递增版本。
