# 00 · 项目状态与文档索引

更新：2026-09-11

当前阶段：**PAT 已确认；正在实现可本地测试的阅读应用**。

## 文档

| 编号 | 文档 | 状态 |
| --- | --- | --- |
| 01 | [产品与工程约定](01-product-contract.md) | 用户需求已记录；实现未开始 |
| 02 | [GitHub 认证、缓存与更新](02-github-auth-cache-and-sync.md) | PAT 已接受，本轮采用所列架构 |
| 03 | [类似项目调研](03-reference-projects.md) | 首轮完成，含固定版本源码依据 |
| 04 | [实现与本地验收](04-implementation-and-local-testing.md) | 实现中 |

## 交付状态

| 工作 | 状态 | 证据或下一步 |
| --- | --- | --- |
| 创建公开仓库并关联本地项目 | 已完成 | [nocoo/ocelot](https://github.com/nocoo/ocelot)，`origin` 指向该仓库 |
| 建立 `main` 原子提交约定 | 已完成 | `AGENTS.md`，提交记录见 `git log` |
| 核验 Basalt 2.1.7、TS 7.0.2 | 已完成 | 本地 Basalt 包信息与 npm 版本查询 |
| 了解本地 Obsidian 约定 | 已完成 | 只读检查规则与文件特征；公开文档仅记录通用需求 |
| 核验 Kami 与 Pierre 集成方式 | 已完成 | 01、03；尚未安装或移植 |
| GitHub 类似项目研究 | 已完成 | 03；README、元数据与相关源码，未运行参考应用 |
| 选择 GitHub 凭据方案 | 已完成 | 用户接受细粒度 PAT 与定期轮换 |
| 确定存储、渲染与同步 | 已确定 | 02；D1 + 私有 R2、按需缓存和条件检查 |
| Vite/Worker、MVVM 基础工程 | 实现中 | 04；Wrangler 本地 Worker、SQLite D1 和充分 mock |
| Biome、Husky、CI 与 UT 门禁 | 未开始 | 非 View 源码四项覆盖率均 ≥95% |
| 阅读界面与 Obsidian 兼容性 | 未开始 | Basalt + Pierre Trees + Kami 排版 |
| Cloudflare 部署与 Access 策略 | 未开始 | 需确定域名与部署配置并验证所有入口 |

## 已确认与待讨论

已确认的用户约束以 01 为准。用户已确认单一 GitHub owner、采用 PAT 并接受
定期轮换，授权实现，同时要求优雅的提醒/加载和完整本地模拟。当前实施采用
02 的 D1/R2、60 秒条件检查与客户端渲染，具体设计和验收见 04。

后续实现前先更新相关文档，状态依次区分“提案”“已接受”“实现中”“已验证”。
源码与文档按同一可验证目标做原子提交到 `main`。

## 本阶段验证

本阶段只有文档与仓库配置，没有运行应用代码，也没有可报告的 UT 覆盖率。

已通过：6 个 Markdown 文件的本地链接、代码块闭合和编号状态检查；7 个
参考项目源码引用的 commit 核验；凭据与调研输出目录的 Git 忽略规则检查。
GitHub API 已确认仓库为公开仓库、默认分支为 `main`。

每次提交前运行 `git diff --cached --check`；推送后核对 `origin/main`
与本地提交一致。原子提交及推送状态以 Git 记录为准。
