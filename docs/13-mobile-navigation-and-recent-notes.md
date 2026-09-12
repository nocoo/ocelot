# 13 · 移动导航与最近更新

状态：**移动导航已实现并通过本地验收；最近更新随对应原子提交记录** · 2026-09-12

## 用户要求

- 修复移动侧栏文件树的纵向触摸滚动，覆盖 drawer 高度、overflow、overscroll、
  touch-action 与 Safari；保持桌面布局、虚拟行几何和 24px 品牌起点。
- 移动侧栏点击任何文章（包括当前文章）后完成导航并关闭；展开目录等操作不关闭。
- 自动维护最近更新的至多 50 篇 Markdown，右上角提供入口，首页 README 正文之前
  显示摘要及文章链接；覆盖不足 50、重命名、删除、同时间和构建缓存。
- 补齐单元、Worker 集成、移动浏览器真实交互及桌面回归；按真实版本执行 Y+1。
- 当前 `main` 起点工作树干净，fetch 后确认 0 ahead / 7 behind；已使用
  `git merge --ff-only origin/main` 从 `dc82808` 同步到 `3a0910b`。
  仅 Codex 写入本仓库，直接在 main 原子提交；不创建 branch/worktree。

## 本轮实施决定

这些是本轮按用户授权选定的实现方案；本节不是完成记录。

### 运行时维护

知识库由用户运行时登记，目录来自 GitHub 的不可变 tree，正文按需读取；构建任务
既没有完整知识库，也不应获得 vault PAT。因此最近更新由已认证的 Worker 按快照
计算，使用现有私有 R2 缓存，不维护手工清单或把知识库写进 Vite 构建产物。

更新时间采用指定 commit 下当前文件路径的最后一次 GitHub 提交历史记录的
`committedDate`，不是作者时间、文件系统 mtime、抓取时间、应用构建时间或
frontmatter。时间规范化为 UTC；降序排列，同时间按完整路径的 UTF-16 码元顺序
升序（不依赖运行平台 locale）。重命名按新路径的历史记录计算，删除的文件由当前
快照过滤；不存在的旧路径不会进入清单。

只纳入现有服务端路径规则允许的 `.md` / `.markdown` 常规文件，且不超过正文
2 MiB 上限。隐藏目录/文件、符号链接、子模块、非 Markdown 附件不纳入；根目录
README 首页及根目录工程说明（AGENTS、CLAUDE、CHANGELOG、LICENSE、CONTRIBUTING、
CODE_OF_CONDUCT、SECURITY）不作为文章推荐。规则集中在 Model 中并单元测试。

通过 GitHub 只读 GraphQL query 批量查询路径历史，Worker 每次只处理有限一批，
以确定性的快照/批次缓存继续计算。全部候选完成后才向读者显示排序结果，不能把
尚未扫描完成的前 50 篇冒充最新 50 篇。失败保留可重建进度并提供重试；不扩大 PAT
权限，不下载所有正文。缓存按算法版本及源 commit 隔离，应用重新构建不会改变
日期或顺序。读取缓存前仍执行 Access、仓库登记与 GitHub 授权检查。

原目录表按 tree SHA 保存内容，不能区分回退后再次出现的相同 tree。增加很小的
commit → tree 版本登记表，沿用同步事务与 30 天清理；列表请求按已登记的 commit
验证。条件同步同时携带 commit，确保内容相同但历史不同的提交也能刷新日期。

首页显示前 5 篇摘要并可打开完整列表；右上角使用有文字的“最近更新”入口。
ViewModel 负责列表加载、切换快照及导航，View 仅展示状态和转发意图。

### 移动导航

先通过浏览器复现真实手势失败，检查 Basalt overlay 与 Pierre Shadow DOM 的
滚动锁。修复放在 Ocelot 集成层，继续使用固定的 Basalt 2.1.7 / Pierre beta.6。
目录展开不作为文章导航；文章导航成功后关闭移动 drawer，重复点击当前文章也
应触发。失败保留可重试状态，桌面侧栏不因文章导航而关闭。

### 发行

同步后的真实版本为 `0.2.0`，本次明确 minor 目标 `0.3.0`。新远端流程已将 CI
与 Release/Deploy 分离，需先修复发布脚本的匹配校验，再由 `scripts/release.ts`
递增版本并发布。匹配 SHA 的 CI 与部署全部成功后，才创建不可变 annotated tag
和 GitHub Release。发布后完成一次生产验收，不继续监控。

## 验证记录

### 移动导航（已完成）

根因已通过真实触摸输入复现：Radix/react-remove-scroll 在 document 处看到的是
Pierre 的 Shadow DOM host，未识别内部滚动容器而取消 touchmove。Ocelot 在树
host 处停止 touchmove/wheel 的事件传播，保留浏览器默认滚动；内部滚动区域明确
设置 pan-y/pinch-zoom、overscroll contain 与 WebKit 惯性滚动。Drawer 使用 dvh、
safe-area 和可收缩的 flex 导航区，未修改 Basalt/Pierre 或 36px 虚拟行几何。

文章激活从“选中值改变”改为真实文件行 click，原生 Enter/Space 仍可激活；文件夹
不会进入文章导航。完成导航后沿用 App 的移动侧栏关闭逻辑，因此当前文章可再次
点击关闭；加载失败保留侧栏重试。Safari 菜单 tap 显式设置返回焦点。

Chromium mobile 通过 CDP 原生触摸输入，未用赋值 scrollTop 冒充手势：

| 视口 | 树可视高度 | 起点 → 向下滑后 → 向上滑后 scrollTop |
| --- | --- | --- |
| 390 × 844 | 500px | 328 → 43 → 341 |
| 390 × 664 | 320px | 506 → 272 → 449 |
| 390 × 480 | 136px | 598 → 531 → 598 |

三个视口的 drawer 均等于视口高度，背景正文及 window 没有随边界手势滚动，logo
左起点均为 24px。新增 9 项 Chromium/WebKit 移动流程全部通过，覆盖目录 tap、
新文章与当前文章 tap、失败后重试、viewport resize、键盘滚动、Escape 及焦点恢复。
桌面真实滚轮双向滚动与 Enter 选文通过，正文滚动位置和展开侧栏保持。既有相邻
行间隔仍为 4px，行起点差 36px。Axe 无违规，已查看手机侧栏与文章截图。

WebKit mobile 使用 iPhone 13 浏览器配置验证 tap、布局、键盘滚动及焦点；Playwright
未提供该引擎的原生 swipe 注入。本轮没有物理 iPhone/iOS Safari 真机结果，不把
WebKit 模拟或设置 scrollTop 当作真机触摸验收。
