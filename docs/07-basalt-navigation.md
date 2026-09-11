# 07 · Basalt 侧栏与路径导航

状态：**导航与上线前品牌区校准均已本地验收** · 2026-09-11

## 核查结果

用户要求应用容器和控件复用 Basalt 2.1.7，目录交互使用 Pierre。
现有侧栏已经使用 `Sidebar`、`SidebarHeader`、`SidebarSearch`、`SidebarNav`
与 `SidebarFooter`；顶部使用 `AppHeader`，其内部使用 Basalt `Breadcrumbs`。
Pierre 仅负责 `SidebarNav` 中的虚拟文件树，与 Basalt 容器没有冲突。

本次发现的缺口：分区标题和底部身份区重复手写了现成控件的结构；桌面折叠
只缩小侧栏宽度，没有呈现 Basalt 的图标导航；面包屑只收到仓库名，没有父目录，
移动端直接隐藏了路径。

依据：已安装包的 `ai/INTEGRATION.md` §7–10、`ai/RECIPES.md` AppFrame，
以及 `dist/components/{sidebar,app-header,breadcrumbs,dropdown-menu}` 的公开 API。
继续固定使用发布包 2.1.7，参考仓库只读。

## 本次实现约定

- 分区标题改用 `SidebarPartition`，底部身份改用 `SidebarUser`，桌面收起状态
  使用 `SidebarIconItem`。展开和收起保留同一棵 Pierre 树及其展开状态；移动端
  沿用 Basalt 的具名抽屉。品牌区与工具栏恢复 Basalt 默认的同高布局。
- 顶部使用 `AppHeader` 的 leading 槽组合侧栏开关和完整的 Basalt `Breadcrumbs`。
  路径为“仓库 → 父目录 → 当前笔记”，只给当前笔记 `aria-current="page"`。
  不再同时传入 `AppHeader.title`，避免祖先被误标为当前页或重复显示标题。
- 仓库和目录段是定位动作，使用 Basalt `Button`，不伪造目录页面链接。点击后
  展开侧栏，在 Pierre 树中展开并聚焦对应目录，保持当前文章、滚动位置和版本。
  根目录定位到树的首项。键盘可继续在目录中选择相邻笔记。
- 长路径收纳中间层级；移动端保留完整路径入口与当前笔记。完整层级使用
  Basalt `DropdownMenu`，支持键盘、Escape 和焦点恢复，中文、空格、百分号
  等目录名保持原样。长名称不挤走工具栏操作，也不造成页面横向溢出。
- 路径拆分放在 Model，定位意图放在 ViewModel；View 只负责 Basalt/Pierre
  组合、响应布局和实际 DOM 焦点。定位使用已加载的目录，不请求 GitHub。

## 用户追加的可读性要求

- 目录树相邻行的 hover 与选中背景需要留出间距，不能连成一片。间距必须
  保持 Pierre 的虚拟行高度计算正确，覆盖 hover、选中与键盘焦点状态。
- 界面文字最小字号为 **11px**，包括品牌副标题、工具栏、状态栏、标签、快捷键
  和弹窗。调整后重新核对移动端换行、溢出与深浅主题对比度。
- 侧栏与 header 采用同一个 Basalt L0 背景 token，移除侧栏独立的明暗色值；
  文件树、移动端抽屉和桌面折叠状态保持同色。

## 上线前品牌区校准

用户要求重新核对侧栏 logo 的位置、标题字号与版本号。当前 27px 标题叠加英文
副标题，配合额外的 24px 左内边距，偏离 Basalt 的单行品牌结构。

依据为已安装 **2.1.7** 包 `ai/INTEGRATION.md` §7 的展开/收起示例和
`SidebarHeader` 实现，并只读参考 Firefly、Giraffe 的侧栏。实施约定：

- 使用 `SidebarHeader` 原生 **56px** 高度、**12px** 水平内边距；logo、产品名
  和版本标签在一行垂直居中，移除副标题和重复的水平内边距。
- 侧栏使用 **24 × 24px** logo，产品名保持 `ocelot`，桌面 **20px / 600**、
  移动端 **18px / 600**；元素间距 **12px**。标题不挤压版本标签。
- 版本继续从根 `package.json` 读取，保留 Basalt `Badge`；使用 secondary
  背景、muted 前景、11px 等宽字和紧凑圆角，取消额外描边与强调色底。
- 收起时只显示居中的同尺寸 logo；保留首页链接的可访问名称和版本提示。
  顶部导航开关保持现有位置与行为。24px 尺寸仅作用于侧栏，文章页脚和空状态
  继续使用原尺寸；不修改 08 中已确认的画稿、透明度或配色。
- 使用现有浏览器流程验证明暗主题、展开/收起、移动端抽屉和最小字号，实测
  品牌元素与 header 中线的对齐及溢出；更新 README 使用的真实截图。此处只
  涉及 View 排版，不增加 View UT。结果在完成后补记。

## 验收计划

- UT：根目录、深层 Unicode 路径；目录定位边界；重复定位；切换笔记后清理
  定位意图；定位不触发内容请求或浏览器历史变更。维持非 View 四项覆盖率 ≥95%。
- 浏览器：完整面包屑、目录定位后的键盘导航；桌面收起/展开不丢失展开状态；
  长路径和移动端菜单；菜单/抽屉焦点；浅色、深色、窄屏无障碍和横向溢出；
  界面最小字号，以及相邻目录行 hover / 选中背景的间隙。
- 工程：TypeScript、Biome、完整 UT/覆盖率、构建和浏览器回归；验证后记录实际
  结果，按同一修正目标原子提交并推送 `main`。

## 验收记录

- 非 View UT **147 项通过**；语句 / 分支 / 函数 / 行覆盖率为
  **100 / 98.34 / 100 / 100%**。这是本轮导航改造完成时的基线；当前累计验证见 05、09。
- Playwright **16 项通过**，约 25 秒；浅色、深色、移动端 axe 无违规。
  路径定位保持正文位置且不请求文档，完整路径菜单和抽屉正确恢复焦点；
  320、390、768、1024、1440px 长路径无横向溢出。
- Pierre 的 36px 虚拟槽内保留 32px 背景和上下各 2px margin；实测相邻
  hover / selected 背景相隔 4px，远端虚拟条目的位置保持正确。
  使用公开 `unsafeCSS` 静态样式扩展；外部路径定位通过公开树容器和 ARIA
  tree 元素接管 DOM 焦点，再调用公开定位 API，不改写树的内部状态。
- 递归检查 Shadow DOM 内外的可见界面文字，最小字号不低于 11px；数学
  公式内部字形比例保留 KaTeX 排版规则。
- 侧栏与 header 实测背景相同：浅色 `rgb(243, 245, 247)`，深色
  `rgb(18, 22, 28)`，均来自 `--basalt-background`。
- TypeScript、Biome、前端构建、Worker dry run 和 `git diff --check` 通过。
  Worker gzip 约 17.26 KiB；前端大 chunk 提示仍按 05 记录。

### 品牌区校准验收

- 类型、Biome 和生产前端构建通过；现有明暗桌面、折叠导航、移动端共 **4 项**
  Chromium 流程通过，axe 无违规，界面文字最小 11px。没有增加 View UT。
- 对明暗主题的展开、收起、移动端抽屉共 **6 个实际浏览器状态**测量：顶栏
  高 56px；展开 logo 位于 `(12, 16)`、尺寸 24 × 24px；logo、产品名和版本号
  的垂直中线均为 `y=28`。折叠 logo 位于 `(22, 16)`，在 68px 侧栏中居中。
- 桌面标题 20px、移动端 18px，字重均为 600；版本 11px、标签高 15px，
  使用 Basalt secondary / muted 颜色。六个状态均无横向溢出或浏览器错误。
- 视觉核对已完成，保留透明、原色的同一 logo；更新 `docs/assets/reader-*.png`
  三张 README 截图。详细本地测量保存在忽略的 `output/testing/sidebar-layout.json`。
