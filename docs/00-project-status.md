# 00 · 项目状态与文档索引

更新：2026-09-12

当前阶段：**阅读器交互、典型样例与本地 HTTPS 已通过本地验收；远程交付以对应 main CI/CD 为准**。

## 文档

| 编号 | 文档 | 状态 |
| --- | --- | --- |
| 01 | [产品与工程约定](01-product-contract.md) | 本地实现与生产交付已验收 |
| 02 | [GitHub 认证、缓存与更新](02-github-auth-cache-and-sync.md) | PAT + D1/R2 已实现并本地验证 |
| 03 | [类似项目调研](03-reference-projects.md) | 首轮完成，含固定版本源码依据 |
| 04 | [实现与本地验收](04-implementation-and-local-testing.md) | 本地验收完成 |
| 05 | [运行契约与验收记录](05-runtime-contract-and-verification.md) | 已记录覆盖率、浏览器结果和支持边界 |
| 06 | [本地运行、PAT 轮换与部署](06-running-and-deployment.md) | 已对齐实际配置与自动部署 |
| 07 | [Basalt 侧栏与路径导航](07-basalt-navigation.md) | 已验收并获用户确认，logo 固定起点，960 帧无位移 |
| 08 | [视觉规范](08-visual-identity.md) | 已采用新品牌图标与双语 README |
| 09 | [身份展示、版本与持续交付](09-identity-and-delivery.md) | 远程 Verify / Security / Deploy 均通过 |
| 10 | [阅读器交互与典型样例](10-reader-interactions.md) | 九项修复、无框选项、GitHub 文件入口与进度布局已本地验收 |
| 11 | [本地 HTTPS 与端口登记](11-local-https.md) | 可信 HTTPS、HMR 与真实浏览器操作已验证 |

## 交付状态

| 工作 | 状态 | 证据或下一步 |
| --- | --- | --- |
| 创建公开仓库并关联本地项目 | 已完成 | [nocoo/ocelot](https://github.com/nocoo/ocelot)，`origin` 指向该仓库 |
| 建立 `main` 原子提交约定 | 已完成 | `AGENTS.md`，提交记录见 `git log` |
| 核验 Basalt 2.1.7、TS 7.0.2 | 已完成 | 本地 Basalt 包信息与 npm 版本查询 |
| 了解本地 Obsidian 约定 | 已完成 | 只读检查规则与文件特征；公开文档仅记录通用需求 |
| 核验 Kami 与 Pierre 集成方式 | 已完成 | 已集成，保留字体与组件许可证 |
| GitHub 类似项目研究 | 已完成 | 03；README、元数据与相关源码，未运行参考应用 |
| 选择 GitHub 凭据方案 | 已完成 | 用户接受细粒度 PAT 与定期轮换 |
| 确定存储、渲染与同步 | 已确定 | 02；D1 + 私有 R2、按需缓存和条件检查 |
| Vite/Worker、MVVM 基础工程 | 已完成 | Wrangler 本地 Worker、SQLite D1、磁盘 R2 和 3 个合成仓库 |
| Biome、Husky、CI 与 UT 门禁 | 本轮本地通过；远程见对应 main CI/CD | 171 UT，四项覆盖率 100 / 98.66 / 100 / 100%，见 10 |
| 阅读界面与 Obsidian 兼容性 | 本地已验证 | 27 浏览器测试，明暗/移动端 axe 无违规；新增交互见 10，边界见 05 |
| Access 身份与作者头像 | 已实现并测试 | 独立加载、同源受保护头像、服务异常回退 |
| 版本与 release | 已实现并本地验证 | 单一版本来源、只读 dry run、CI/CD 成功后不可变 tag |
| Cloudflare 部署与 Access 策略 | 已交付并验证 | D1 迁移、私有 R2、完整 Git 标签和 Access 入口通过；远程证据见 09 |

## 已确认的实施范围

已确认的用户约束以 01 为准。用户已确认单一 GitHub owner、采用 PAT 并接受
定期轮换，授权实现，同时要求优雅的提醒/加载和完整本地模拟。当前实施采用
02 的 D1/R2、60 秒条件检查与客户端渲染，具体设计和验收见 04。

后续实现前先更新相关文档，状态依次区分“提案”“已接受”“实现中”“已验证”。
源码与文档按同一可验证目标做原子提交到 `main`。

## 本阶段验证

本地类型、Biome、完整 UT 覆盖率、生产前端构建、Worker dry run 与 Playwright
均已通过。初始验证见 05，本轮测试数量、覆盖分母与交互证据见 10；启动和部署
步骤见 06，本机 HTTPS 与独立端口见 11。
域名、Access 参数与 CD 凭据已配置；远程资源、运行版本及 Access 入口已通过
部署脚本核验。已确认的 sidebar 修正也已随对应提交通过完整 CI/CD。
用户已在生产配置 GitHub PAT；普通变量被发布配置覆盖的原因已确认，同一凭据
已恢复为 Worker Secret 并通过 GitHub 检测。持续 loading 的状态修复见 07，
凭据恢复记录见 09；不能将凭据检测成功视为真实私有知识库已完成接入。
远程 CI/CD 证据见 09；正式发行记录以 GitHub Release 及其不可变 tag 为准。
后续目录状态与空白页完整插图的本地结果分别见 07、08，部署结果以对应
`main` 提交的 [CI/CD](https://github.com/nocoo/ocelot/actions/workflows/verify.yml) 为准。

每次提交前运行 `git diff --cached --check`；推送后核对 `origin/main`
与本地提交一致。原子提交及推送状态以 Git 记录为准。
