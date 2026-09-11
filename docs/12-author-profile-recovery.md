# 12 · 线上作者身份资料恢复

状态：**修复已通过 Cloudflare 真实资料请求及本地验收；交付结果见对应 main CI/CD** · 2026-09-12

## 用户要求

线上左下角仍未正确显示姓名和头像；参考上级其他项目，修复真实的资料加载链路。
继续遵循 Basalt 的侧栏身份布局；资料加载不能阻塞阅读，也不能影响 Access 验证。

## 已核实的依据

- 只读对照 Surety、Fundly、Dove 的 `author-profile.ts` 及侧栏调用：
  都以规范化邮箱的 UTF-8 SHA-256 查询 lizheng.blog，资料与头像用于登录身份展示。
- 本机对公开查询发出与 Ocelot 相同的请求头，返回 `200 application/json`、
  正确的公开姓名与 `https://b.no.mt` 头像。不能据此推断云端请求也已成功。
- 独立的 Cloudflare 远程预览导入实际 `worker/profile.ts`，只查询公开资料，
  复现运行时错误：`Invalid redirect value, must be one of "follow" or "manual"`。
  原有 `redirect: "error"` 使请求在发出前失败；实际 `authorProfile` 返回两个
  空值，`authorAvatar` 返回不可用。这是本轮确认的直接原因。
- Ocelot 的 `publicResource` 把 `caches.open`、读取、网络请求和写入放在同一
  `try/catch` 中；任一缓存错误都会变成空资料，甚至丢弃已成功取得的网络响应。
- [Cloudflare Cache API 当前说明](https://developers.cloudflare.com/workers/runtime-apis/cache/#background)
  明确指出 Access 前置的 Worker 中 Cache API 不可用。本地 workerd 可用的缓存
  测试不能代表这一线上环境。
- 当前浏览器自动化不能读取已登录的生产标签页；不修改浏览器安全设置，
  不采集私有笔记、浏览器凭据或 Access token。

## 本轮实施约定

- 采用 Cloudflare 支持的 `redirect: "manual"`，通过现有状态检查拒绝 3xx；
  不自动跟随重定向，不扩大头像来源范围。补充拒绝资料/头像重定向的回归。
- 姓名与头像以公开接口结果为准，不硬编码作者身份。缓存故障不能截断合法
  网络请求或丢弃已校验的响应；维持资料大小限制、头像 origin/MIME 限制和超时。
- `/api/profile` 与 `/api/avatar` 仍在 Access 授权后执行；不创建私有内容旁路，
  不放宽 Markdown 图片的 CSP，不改变源仓库访问权限。
- 临时云端诊断仅查询已公开的作者接口，不挂载 Ocelot 的 D1、R2、Secrets，
  不修改参考项目；结束后关闭诊断会话。
- 对确认的故障补充回归，记录真实结果，再原子提交与推送 `main`。

## 验证

| 范围 | 结果与证据 |
| --- | --- |
| 云端修复前 | 实际 helper 返回 `{name: null, avatar: null}`，头像不可用；直接请求复现不支持 `redirect: "error"` 的运行时异常 |
| 云端修复后 | 同一临时远程预览导入修改后的 helper，公开查询 `200 application/json`；实际 `authorProfile` 返回 `Zheng Li` 与有效头像，`authorAvatar` 返回 `200 image/jpeg`、2641 字节 |
| 缓存故障复现 | 修复前新增 open / match / put 三项回归均失败；有效的网络资料被错误回退为空 |
| Worker 资料回归 | 修复后 13 项通过；包含三种缓存故障、429 且缓存不可用后的恢复、资料/头像 3xx 拒绝、Access 先于缓存、哈希、响应类型和大小限制 |
| 全部非 View runtime | 177 UT 通过；statements `1082/1082`、branches `888/900`、functions `201/201`、lines `958/958`；覆盖率 `100 / 98.66 / 100 / 100%`；`worker/profile.ts` 四项均为 `100%` |
| 工程 | TypeScript 7.0.2、Biome、Vite 构建、Worker dry run 均通过；Worker `66.00 KiB / gzip 18.19 KiB`；无依赖变更 |
| 安全扫描 | OSV 与 Gitleaks 通过 |
| 浏览器 | 完整 Chromium 回归 `27/27`，42.0 秒；覆盖身份延迟加载、头像失效、Basalt 姓名/头像尺寸与对齐、折叠身份、明暗/移动端 axe |
| 视觉 | 已检查[合成公开身份截图](assets/sidebar-public-identity.png)：头像 36px、姓名 14px、副标题 12px、垂直居中，底部布局稳定 |

临时远程预览已关闭；诊断没有挂载应用资源或读取私有内容。
浏览器使用合成身份和知识库；真实公开资料通过上面的 Cloudflare 远程运行验证，
不能将其写成已验收生产浏览器中的私有知识库。
原子提交推送后的 Verify / Security / Deploy 以对应 `main` 的
[持续交付记录](https://github.com/nocoo/ocelot/actions/workflows/verify.yml) 为准。
