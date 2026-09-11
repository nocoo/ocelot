# 03 · 类似项目调研

状态：**首轮调研完成；架构选择待讨论**

核验日期：2026-09-11

## 结论

找到五个可用于不同部分的参考项目。其中 **Flowershow** 的 GitHub 认证与
增量同步最接近我们的后端需求，**Perlite / Obsidian-Gitsync-Perlite** 更接近
只读 Obsidian 阅读目标，**Obsidian-Web-Sync-R2** 直接展示了 Worker 从 R2
读取和渲染 Markdown。Quartz 提供成熟的静态发布路线对照。

这次核验包括 README、仓库元数据和相关源码；没有运行这些项目的完整应用，
也没有据此宣称其性能或安全性已通过 Ocelot 验收。

## 对比

| 项目 | 认证、内容与更新方式 | 对 Ocelot 的价值 | 不匹配之处 |
| --- | --- | --- | --- |
| [Flowershow](https://github.com/flowershow/flowershow) | GitHub App installation token；验证 push webhook；Cloudflare Workflow 对比路径与 SHA，下载变更文件到对象存储 | 服务端凭据、Git tree/blob API、增量判断、有限批处理 | 还包含 Next.js、Postgres、发布流程与多用户能力；Ocelot 首版只需其中的架构思路 |
| [Obsidian-Gitsync-Perlite](https://github.com/l4rm4nd/Obsidian-Gitsync-Perlite) | 私有仓库用环境变量中的 GitHub 用户名/token；git-sync 默认每 30 秒同步到共享卷，Perlite 只读挂载 | 将 Git 同步职责与只读阅读职责分离 | 常驻容器和本地完整 checkout，不是 Worker 按需文件缓存 |
| [Perlite](https://github.com/secure-77/Perlite) | PHP 从本地 vault 读取并渲染 Markdown；自行部署 Web 访问边界 | 双链、附件、目录和阅读兼容性参考；源码检查文件是否属于可见清单 | 没有该项目内的 GitHub 按需认证/缓存方案 |
| [Obsidian-Web-Sync-R2](https://github.com/soestin/Obsidian-Web-Sync-R2) | Obsidian 插件上传 R2；Worker 使用 unified/remark/rehype 读取并渲染 | 直接验证 R2 binding → Markdown 渲染可行 | 数据来源是插件同步；导航每次读取全部 Markdown，未在 Worker 源码中验证 Access JWT |
| [Quartz](https://github.com/jackyzha0/quartz) | 构建 Markdown 为静态站；托管集成在 Git push 后重新构建和部署 | Obsidian 发布生态、静态阅读路线参考 | 添加仓库与更新通常依赖构建/发布，不直接提供 Ocelot 的运行时私有仓库读取 |

## 关键源码证据

链接固定到调研时的 commit，避免后续默认分支变化影响判断。

### Flowershow

代码快照：`096a0c5132acb8d2351f0e70c3e8c1ab38100bd7`。仓库标记 AGPL-3.0。

- [Worker GitHub 客户端](https://github.com/flowershow/flowershow/blob/096a0c5132acb8d2351f0e70c3e8c1ab38100bd7/apps/cloudflare-worker/src/github.js)：
  用 App 私钥签发 JWT、换取 installation token，通过 tree 与 blob API 读取源内容。
- [GitHub 同步 Workflow](https://github.com/flowershow/flowershow/blob/096a0c5132acb8d2351f0e70c3e8c1ab38100bd7/apps/cloudflare-worker/src/github-sync-workflow.js)：
  `computeFilesToUpsert` 比较保存的 path/SHA；删除不存在的路径；分批下载和上传文件。
- [Webhook 路由](https://github.com/flowershow/flowershow/blob/096a0c5132acb8d2351f0e70c3e8c1ab38100bd7/apps/flowershow/app/api/webhooks/github-app/route.ts)：
  检查 `x-hub-signature-256`，处理安装、仓库权限变化与 push，再触发同步任务。
- [应用侧 GitHub 凭据处理](https://github.com/flowershow/flowershow/blob/096a0c5132acb8d2351f0e70c3e8c1ab38100bd7/apps/flowershow/lib/github.ts)：
  缓存并重取 installation token。

Ocelot 适合借鉴“按 SHA 判断变化”，进一步让未打开的正文保持未下载。
不能把分支名当作一次读取期间永远不变的快照；我们需要先固定 commit/tree，
并检查 tree 截断。此次只参考架构，未复制该项目实现。

### Perlite 与 git-sync 组合

- [Perlite 内容入口](https://github.com/secure-77/Perlite/blob/2869faaaf06320bbf84f46d211fc22594fc430fd/perlite/content.php)：
  从可见文件清单校验路径后 `file_get_contents`，使用 Parsedown 渲染。
- [Perlite Docker 配置](https://github.com/secure-77/Perlite/blob/2869faaaf06320bbf84f46d211fc22594fc430fd/docker-compose.yml)：
  vault 以只读 volume 挂载；显式控制隐藏文件和 HTML safe mode。
- [git-sync 组合配置](https://github.com/l4rm4nd/Obsidian-Gitsync-Perlite/blob/87988b44fb5dfd48eb82fd3859528308628d88c8/docker-compose.yml)：
  `GIT_SYNC_USERNAME` / `GIT_SYNC_PASSWORD` 用于私有仓库，`GIT_SYNC_PERIOD=30s`，
  同步进程和网页共享持久目录。

Perlite 为 MIT。组合仓库未声明可识别许可证，因此仅作为方案证据。
Ocelot 沿用“源只读、目录和正文采用同一可见性规则”的原则，通过 GitHub API
与 R2 替换本地文件系统，也不要求用户为阅读器修改原仓库的链接格式。

### Worker + R2 示例

代码快照：`c7a2386854dee5d347b5a9504f2af21a0b6f6094`；未声明可识别许可证。

- [Worker 入口](https://github.com/soestin/Obsidian-Web-Sync-R2/blob/c7a2386854dee5d347b5a9504f2af21a0b6f6094/src/index.ts)：
  `env.OBSIDIAN_BUCKET.get()` 读取正文，经过 remark/rehype 管线生成 HTML。
- 同一入口每次请求先运行 `listFiles()`，对列出的 Markdown 批量读取 frontmatter；
  没有处理 R2 list 的后续 cursor。适合作为小型示例，不适合直接移植为大库导航。
- [元数据解析](https://github.com/soestin/Obsidian-Web-Sync-R2/blob/c7a2386854dee5d347b5a9504f2af21a0b6f6094/src/utils.ts)
  只是逐行分割 `:`，不足以处理真实 YAML frontmatter 和 wikilink 关系。

Ocelot 需要缓存目录快照，逐文件读取正文，并在源内容、frontmatter 展示、
附件和 API 层统一实施校验。此次仅引用方案，未采用该实现。

### Quartz

代码快照：`f1fba3fc55cbf60a60a5d09c95a49c042cdab63a`，默认分支 `v5`，MIT。

[托管文档](https://github.com/jackyzha0/quartz/blob/f1fba3fc55cbf60a60a5d09c95a49c042cdab63a/docs/hosting.md)
给出构建输出到 `public`、上传静态产物与持续部署流程。私有的 Git 源仓库
不自动让生成网站变成私有；产物访问需要另外保护。Ocelot 希望在应用内增加
仓库并按需读取，因此不采用整站静态重建作为主路径。

## 用户指定的界面参考

- Basalt 本地源码与 npm 均确认 `@nocoo/basalt@2.1.7`；TypeScript
  `7.0.2` 也已核验存在。
- [Kami 排版规范](https://github.com/tw93/Kami/blob/4dab24cc4c527dbb35aa8fae09e02822992dfbe2/skills/kami/references/design.md)：
  面向中英文文档，明确说明自己不是 UI framework。迁移排版规则时按屏幕阅读
  和 Ocelot 的冷蓝灰主题调整；字体分别核对许可。
- [Pierre Trees README](https://github.com/pierrecomputer/pierre/blob/f6d917f9d348ed1339cd6e35a8f009fbc7733d83/packages/trees/README.md)：
  提供 React 入口、路径状态、搜索、Git 状态标记和 Shadow DOM 主题变量。
  npm 当前 `latest` / `beta` 都是 `1.0.0-beta.6`，React peer 支持 19；
  集成前固定版本并实测目录树交互与 Basalt 主题映射。

原始 README 与元数据保存在本机 `output/zhengli-github-summary/`，该目录
已忽略，不进入公开仓库。正式的适配决策见 [02 · 认证、缓存与更新](02-github-auth-cache-and-sync.md)。
