# Ocelot

面向个人 Obsidian 知识库的只读网页阅读器。添加 GitHub 公开或私有仓库，
以清晰的文件导航和舒适的中英文排版阅读笔记。

部署目标为 Cloudflare Workers，访问由 Cloudflare Access 保护。采用
Basalt 2.1.7 的控件与布局、Kami 的文档排版原则和 Pierre Trees 文件树。

当前处于**架构讨论阶段**，已完成建仓、需求记录和首轮参考项目调研。

- [00 · 项目状态与文档索引](docs/00-project-status.md)
- [01 · 产品与工程约定](docs/01-product-contract.md)
- [02 · GitHub 认证、缓存与更新提案](docs/02-github-auth-cache-and-sync.md)
- [03 · 类似项目调研](docs/03-reference-projects.md)
- [开发协作约定](AGENTS.md)

工程目标：Vite、React、TypeScript 7.0.2、MVVM、Biome、Husky；非 View
代码的单元测试四项覆盖率均至少 95%。在 `main` 上按可验证的结果做原子提交。

本仓库保存应用源码和设计文档。私有笔记与运行凭据保留在受保护的运行环境中。
