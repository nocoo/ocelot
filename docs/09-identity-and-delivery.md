# 09 · 身份展示、版本与持续交付

状态：**D1/R2 已创建，Worker 已部署；域名首次生效与交付验证进行中** · 2026-09-11

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
- 资料请求设置超时、响应体大小限制和缓存；资料不可用时回退到登录身份，
  不阻止阅读。头像失败显示稳定的 Basalt Avatar 回退，身份区不跳动。
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
因为 Worker 已上传就创建 Release。远程成功证据在最终验证后补齐。
尚未提供 GitHub vault PAT，也未宣称真实私有知识库已完成线上验收。
