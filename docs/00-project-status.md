# 00 · 项目状态与文档索引

更新：2026-09-11

当前阶段：**本地阅读应用已实现并验收；生产部署待配置**。

## 文档

| 编号 | 文档 | 状态 |
| --- | --- | --- |
| 01 | [产品与工程约定](01-product-contract.md) | 本地实现完成，生产待配置 |
| 02 | [GitHub 认证、缓存与更新](02-github-auth-cache-and-sync.md) | PAT + D1/R2 已实现并本地验证 |
| 03 | [类似项目调研](03-reference-projects.md) | 首轮完成，含固定版本源码依据 |
| 04 | [实现与本地验收](04-implementation-and-local-testing.md) | 本地验收完成 |
| 05 | [运行契约与验收记录](05-runtime-contract-and-verification.md) | 已记录覆盖率、浏览器结果和支持边界 |
| 06 | [本地运行、PAT 轮换与部署](06-running-and-deployment.md) | 本地已验证，生产步骤待执行 |

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
| Biome、Husky、CI 与 UT 门禁 | 已配置，本地通过 | 145 UT，四项覆盖率 100 / 98.33 / 100 / 100% |
| 阅读界面与 Obsidian 兼容性 | 本地已验证 | 13 浏览器测试，明暗/移动端 axe 无违规；边界见 05 |
| Cloudflare 部署与 Access 策略 | 入口已实现，尚未部署 | JWT 校验与生产 dry run 通过；真实资源和域名待配置 |

## 已确认的实施范围

已确认的用户约束以 01 为准。用户已确认单一 GitHub owner、采用 PAT 并接受
定期轮换，授权实现，同时要求优雅的提醒/加载和完整本地模拟。当前实施采用
02 的 D1/R2、60 秒条件检查与客户端渲染，具体设计和验收见 04。

后续实现前先更新相关文档，状态依次区分“提案”“已接受”“实现中”“已验证”。
源码与文档按同一可验证目标做原子提交到 `main`。

## 本阶段验证

本地类型、Biome、完整 UT 覆盖率、生产前端构建、Worker dry run 与 Playwright
均已通过。具体测试数量、覆盖分母与交互证据见 05；启动和部署步骤见 06。
生产 PAT、实际 Access 策略、域名与远程 D1/R2 尚未配置，不能将本地模拟通过
视为真实私有仓库已经接入。远程 CI 执行状态见 GitHub Actions。

每次提交前运行 `git diff --cached --check`；推送后核对 `origin/main`
与本地提交一致。原子提交及推送状态以 Git 记录为准。
