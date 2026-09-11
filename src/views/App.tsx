import { AppHeader } from "@nocoo/basalt/components/app-header";
import { AppMain, AppShell, AppSkipLink } from "@nocoo/basalt/components/app-shell";
import { Button } from "@nocoo/basalt/components/button";
import { DialogDescription, DialogTitle } from "@nocoo/basalt/components/dialog";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import {
  ContentIsland,
  Sidebar,
  SidebarFooter,
  SidebarHeader,
  SidebarIconItem,
  SidebarNav,
  SidebarPartition,
  SidebarProvider,
  SidebarSearch,
  SidebarUser,
} from "@nocoo/basalt/components/sidebar";
import { ThemeProvider } from "@nocoo/basalt/providers/theme";
import {
  ArrowDownToLine,
  ArrowUp,
  BookOpen,
  Check,
  ChevronRight,
  ChevronsUpDown,
  CircleHelp,
  Clock3,
  FlaskConical,
  GitBranch,
  Link2,
  ListTree,
  LoaderCircle,
  LockKeyhole,
  Moon,
  PanelLeft,
  Plus,
  RotateCw,
  Search,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { connectionPresentation } from "../models/connection";
import type { Heading } from "../models/document";
import { changedFiles, fileTitle, isMarkdown } from "../models/vault";
import type { ReaderViewModel } from "../viewmodels/reader";
import { Dialogs } from "./Dialogs";
import { Mark } from "./Mark";
import { Markdown } from "./Markdown";
import { NavigationTree } from "./NavigationTree";
import { ReaderBreadcrumbs } from "./ReaderBreadcrumbs";
import { useResolvedTheme } from "./useResolvedTheme";

export function App({ model }: { model: ReaderViewModel }) {
  useEffect(() => model.mount(), [model]);
  return (
    <ThemeProvider storageKey="ocelot-theme">
      <Reader model={model} />
    </ThemeProvider>
  );
}

function ThemeButton() {
  const { resolvedTheme, setTheme } = useResolvedTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="chrome-button"
      title={resolvedTheme === "dark" ? "切换到浅色" : "切换到深色"}
      aria-label={resolvedTheme === "dark" ? "切换到浅色" : "切换到深色"}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {resolvedTheme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
    </Button>
  );
}

function Reader({ model }: { model: ReaderViewModel }) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 767px)").matches);
  const [collapsed, setCollapsed] = useState(() => window.matchMedia("(max-width: 767px)").matches);
  const railCollapsed = collapsed && !compact;
  const [outlineOpen, setOutlineOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ progress: 0, heading: "" });
  const connection = connectionPresentation(state.session?.connection ?? null);
  const snapshot = state.snapshot;
  const reading = state.reading;
  const updateCount = useMemo(
    () =>
      state.pending
        ? Object.keys(changedFiles(snapshot?.files ?? [], state.pending.files)).length
        : 0,
    [snapshot?.files, state.pending],
  );
  const navigate = useCallback(
    (path: string, anchor?: string) => {
      void model.selectNote(path, anchor);
    },
    [model],
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => {
      setCompact(media.matches);
      setCollapsed(media.matches);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Every completed navigation closes the mobile drawer, including same-note anchors.
  useEffect(() => {
    if (compact) setCollapsed(true);
  }, [compact, state.navigation.version]);
  useEffect(() => {
    if (state.directoryFocus) setCollapsed(false);
  }, [state.directoryFocus]);
  useEffect(() => {
    const container = scroller.current;
    if (!container) return;
    if (state.navigation.anchor)
      document.getElementById(state.navigation.anchor)?.scrollIntoView({ block: "start" });
    else if (!state.navigation.preserve) container.scrollTop = 0;
  }, [state.navigation]);
  useEffect(() => {
    const container = scroller.current;
    if (!container) return;
    const update = () => {
      const height = container.scrollHeight - container.clientHeight;
      const headings = reading?.parsed.headings ?? [];
      const top = container.getBoundingClientRect().top + 100;
      let active = headings[0]?.id ?? "";
      for (const heading of headings) {
        const element = document.getElementById(heading.id);
        if (element && element.getBoundingClientRect().top <= top) active = heading.id;
      }
      setPosition({
        progress:
          height <= 0 ? 100 : Math.min(100, Math.round((container.scrollTop / height) * 100)),
        heading: active,
      });
    };
    update();
    container.addEventListener("scroll", update, { passive: true });
    const resize = new ResizeObserver(update);
    resize.observe(container);
    return () => {
      container.removeEventListener("scroll", update);
      resize.disconnect();
    };
  }, [reading]);
  useEffect(() => {
    document.title = reading ? `${reading.parsed.title} · Ocelot` : "Ocelot · 私人阅读室";
  }, [reading]);

  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
    setOutlineOpen(false);
  };
  return (
    <SidebarProvider
      collapsed={collapsed}
      onCollapsedChange={setCollapsed}
      overlay={compact}
      defaultWidth={280}
    >
      <AppShell className="ocelot-shell">
        <AppSkipLink>跳到正文</AppSkipLink>
        <Sidebar id="vault-sidebar" className="ocelot-sidebar">
          {compact && (
            <>
              <DialogTitle className="sr-only">知识库导航</DialogTitle>
              <DialogDescription className="sr-only">选择知识库或打开一份笔记。</DialogDescription>
            </>
          )}
          <SidebarHeader className={`brand-header ${railCollapsed ? "is-collapsed" : ""}`}>
            <a className="brand" href="/" aria-label="Ocelot 首页">
              <Mark small={railCollapsed} />
              {!railCollapsed && (
                <span>
                  ocelot<small>YOUR PRIVATE READING ROOM</small>
                </span>
              )}
            </a>
          </SidebarHeader>
          <div className="sidebar-expanded" hidden={railCollapsed}>
            <div className="sidebar-tools">
              <Button
                variant="outline"
                className="repository-switch"
                onClick={() => model.openDialog("repositories")}
              >
                <span className="repo-icon">
                  <BookOpen size={18} aria-hidden="true" />
                </span>
                <span className="repo-title">
                  <strong>{snapshot?.repository.name ?? "我的知识库"}</strong>
                  <small>
                    {snapshot
                      ? `${snapshot.repository.owner} / ${snapshot.repository.branch}`
                      : "添加一座自己的数字花园"}
                  </small>
                </span>
                <ChevronsUpDown size={14} aria-hidden="true" />
              </Button>
              <SidebarSearch onClick={() => model.openDialog("search")} disabled={!snapshot}>
                <span>搜索笔记</span>
              </SidebarSearch>
            </div>
            <SidebarPartition className="tree-caption">
              <span>知识库目录</span>
              <span>
                {snapshot
                  ? `${snapshot.files.filter((file) => isMarkdown(file.path)).length.toLocaleString()} 篇`
                  : ""}
              </span>
            </SidebarPartition>
          </div>
          {railCollapsed && (
            <SidebarNav className="sidebar-shortcuts" aria-label="知识库快捷导航">
              <SidebarIconItem
                aria-label="展开知识库目录"
                title="展开知识库目录"
                onClick={() => setCollapsed(false)}
              >
                <ListTree size={19} />
              </SidebarIconItem>
              <SidebarIconItem
                aria-label="搜索笔记"
                title="搜索笔记 · ⌘K"
                disabled={!snapshot}
                onClick={() => model.openDialog("search")}
              >
                <Search size={18} />
              </SidebarIconItem>
              <SidebarIconItem
                aria-label="切换知识库"
                title="切换知识库"
                onClick={() => model.openDialog("repositories")}
              >
                <BookOpen size={18} />
              </SidebarIconItem>
            </SidebarNav>
          )}
          <SidebarNav className="navigation-area" aria-label="笔记导航" hidden={railCollapsed}>
            {snapshot ? (
              <NavigationTree
                key={snapshot.repository.id}
                snapshot={snapshot}
                selected={reading?.path}
                changes={state.changes}
                visible={!railCollapsed}
                reveal={state.directoryFocus}
                onSelect={navigate}
              />
            ) : (
              <div className="tree-skeleton" aria-hidden="true">
                {[76, 90, 66, 83, 58, 72].map((width, index) => (
                  <span
                    key={width}
                    className="shimmer"
                    style={{ width: `${width}%`, marginLeft: index % 2 ? 18 : 0 }}
                  />
                ))}
              </div>
            )}
          </SidebarNav>
          <SidebarFooter className={`sidebar-bottom ${railCollapsed ? "is-collapsed" : ""}`}>
            {railCollapsed ? (
              <SidebarIconItem
                className={`connection-shortcut ${connection.tone}`}
                aria-label={`阅读连接：${connection.label}`}
                title={connection.label}
                onClick={() => model.openDialog("connection")}
              >
                <Link2 size={18} />
                <span className="status-dot" />
              </SidebarIconItem>
            ) : (
              <>
                <Button
                  variant="ghost"
                  className={`connection-button ${connection.tone}`}
                  onClick={() => model.openDialog("connection")}
                >
                  <span className="status-dot" />
                  <span>{connection.label}</span>
                  <ChevronRight size={14} aria-hidden="true" />
                </Button>
                <SidebarUser
                  className="space-identity"
                  name="我的私人阅读室"
                  email="安静，只读，自由探索"
                  avatar={
                    <span className="identity-icon">
                      <LockKeyhole size={15} aria-hidden="true" />
                    </span>
                  }
                  action={
                    state.session?.local ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="本地体验场景"
                        title="本地体验场景"
                        onClick={() => model.openDialog("local")}
                      >
                        <FlaskConical size={16} />
                      </Button>
                    ) : (
                      <ShieldCheck size={17} aria-label="受登录保护" />
                    )
                  }
                />
              </>
            )}
          </SidebarFooter>
        </Sidebar>
        <AppMain className="reader-main" tabIndex={-1}>
          <AppHeader
            className="reader-toolbar"
            leading={
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="chrome-button"
                  title="切换知识库导航"
                  aria-label="切换知识库导航"
                  aria-expanded={!collapsed}
                  aria-controls="vault-sidebar"
                  onClick={() => setCollapsed(!collapsed)}
                >
                  <PanelLeft size={18} />
                </Button>
                <ReaderBreadcrumbs
                  snapshot={snapshot}
                  path={reading?.path}
                  compact={compact}
                  onReveal={(path) => model.revealDirectory(path)}
                />
              </>
            }
            actions={
              <>
                <Button
                  variant="ghost"
                  className={`sync-button ${state.pending ? "update-ready" : ""}`}
                  onClick={() => {
                    if (state.pending) void model.applyUpdate();
                    else void model.check(true);
                  }}
                  disabled={
                    !snapshot ||
                    state.loading ||
                    state.checking ||
                    (state.session?.connection.retryAt ?? 0) > Date.now()
                  }
                  aria-label={state.pending ? `应用更新，${updateCount} 份文件` : "检查更新"}
                  title={state.pending ? `${updateCount} 份文件有新版本，点击应用` : "检查更新"}
                >
                  <span className={state.checking ? "spin" : ""}>
                    {state.checking ? (
                      <LoaderCircle size={14} />
                    ) : state.pending ? (
                      <ArrowDownToLine size={14} />
                    ) : (
                      <RotateCw size={14} />
                    )}
                  </span>
                  <span>
                    {state.checking
                      ? "正在检查"
                      : state.pending
                        ? `应用更新 · ${updateCount}`
                        : "检查更新"}
                  </span>
                </Button>
                <span className="toolbar-divider" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="chrome-button type-button"
                  aria-label="阅读偏好"
                  title="阅读偏好"
                  onClick={() => model.openDialog("preferences")}
                >
                  Aa
                </Button>
                <ThemeButton />
                <Button
                  variant="ghost"
                  size="icon"
                  className="chrome-button copy-button"
                  aria-label="复制阅读链接"
                  title="复制阅读链接"
                  onClick={() => {
                    void model.copyLink();
                  }}
                  disabled={!reading}
                >
                  <Link2 size={17} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="chrome-button mobile-outline-button"
                  aria-label="文章大纲"
                  title="文章大纲"
                  onClick={() => setOutlineOpen(!outlineOpen)}
                  disabled={!reading?.parsed.headings.length}
                >
                  <ListTree size={17} />
                </Button>
              </>
            }
          />
          {(state.loading || state.booting) && (
            <div className="loading-line" role="status">
              <span className="sr-only">
                {state.pendingPath
                  ? `正在打开 ${fileTitle(state.pendingPath)}`
                  : "正在准备阅读空间"}
              </span>
            </div>
          )}
          {state.error && !state.dialog && (
            <div className="reader-error" role="alert">
              <CircleHelp size={17} aria-hidden="true" />
              <span>{state.error.message}</span>
              {state.error.code === "access_required" ? (
                <a href="/">重新登录</a>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (state.session) void model.recheckConnection();
                    else void model.start();
                  }}
                >
                  重试
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                aria-label="收起提醒"
                onClick={() => model.dismissError()}
              >
                <X size={14} />
              </Button>
            </div>
          )}
          <div className="island-wrap">
            <ContentIsland className="reading-island">
              <div className="reading-scroll" ref={scroller}>
                {reading && snapshot ? (
                  <div className="reading-grid">
                    <article
                      className="article"
                      aria-labelledby="document-title"
                      style={{ "--reading-scale": state.fontScale } as CSSProperties}
                    >
                      <div className="article-eyebrow">
                        <span className="eyebrow-line" />
                        <span>{snapshot.repository.name.toUpperCase()}</span>
                        <span className="eyebrow-dot">·</span>
                        <span>NOTES & CONNECTIONS</span>
                      </div>
                      <div className="article-heading">
                        <PageHeader
                          title={<span id="document-title">{reading.parsed.title}</span>}
                          description={reading.parsed.description}
                        />
                      </div>
                      <div className="article-meta">
                        <span>
                          <Clock3 size={13} aria-hidden="true" />
                          {reading.parsed.minutes} 分钟阅读
                        </span>
                        <span className="meta-divider" />
                        {reading.parsed.tags.map((tag) => (
                          <span className="article-tag" key={tag}>
                            {tag}
                          </span>
                        ))}
                        <span className="read-only">
                          <LockKeyhole size={12} aria-hidden="true" />
                          只读
                        </span>
                      </div>
                      <div className="prose">
                        <Markdown reading={reading} snapshot={snapshot} onNavigate={navigate} />
                      </div>
                      <footer className="article-footer">
                        <Mark small />
                        <span>留一点空白，给下一个想法。</span>
                        <button
                          type="button"
                          onClick={() =>
                            scroller.current?.scrollTo({
                              top: 0,
                              behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                                .matches
                                ? "auto"
                                : "smooth",
                            })
                          }
                          aria-label="回到文章顶部"
                        >
                          <ArrowUp size={16} />
                        </button>
                      </footer>
                    </article>
                    <aside className="outline-column" aria-label="文章大纲">
                      <Outline
                        headings={reading.parsed.headings}
                        active={position.heading}
                        jump={jump}
                      />
                      <div className="reading-progress">
                        <span>阅读进度</span>
                        <span>{position.progress}%</span>
                        <div>
                          <i style={{ width: `${position.progress}%` }} />
                        </div>
                      </div>
                      <div className="quiet-note">
                        <span className="quiet-note-line" />
                        <p>
                          慢慢读，
                          <br />
                          让想法停留片刻。
                        </p>
                      </div>
                    </aside>
                  </div>
                ) : state.loading || state.booting ? (
                  <ReadingSkeleton />
                ) : (
                  <div className="empty-reading">
                    <Mark />
                    <p className="section-eyebrow">A SPACE OF YOUR OWN</p>
                    <h1>给你的知识，一处安静的入口。</h1>
                    <p>
                      连接一个 GitHub 上的 Obsidian 知识库，
                      <br />
                      从一份笔记开始，走进自己的数字花园。
                    </p>
                    <Button onClick={() => model.openDialog("repositories")}>
                      <Plus size={16} />
                      添加知识库
                    </Button>
                  </div>
                )}
              </div>
            </ContentIsland>
          </div>
          <div className="reading-status">
            <span>
              {state.session?.local ? (
                <>
                  <span className="local-dot" />
                  本地体验
                </>
              ) : (
                <>
                  <ShieldCheck size={12} />
                  私人阅读空间
                </>
              )}
            </span>
            <span role="status">
              {state.notice ||
                (state.loading && reading ? (
                  "正在准备下一份笔记…"
                ) : state.pending ? (
                  `${updateCount} 份文件有新版本，可在工具栏应用`
                ) : snapshot ? (
                  <>
                    <GitBranch size={12} />
                    {snapshot.repository.branch}
                    <span className="status-separator">/</span>
                    <code>{snapshot.commitSha.slice(0, 7)}</code>
                    <Check size={12} />
                    阅读版本
                  </>
                ) : (
                  "文字，自有去处。"
                ))}
            </span>
          </div>
        </AppMain>
        {outlineOpen && reading && (
          <div className="mobile-outline">
            <div>
              <strong>在这篇笔记里</strong>
              <Button
                size="icon"
                variant="ghost"
                aria-label="关闭文章大纲"
                onClick={() => setOutlineOpen(false)}
              >
                <X size={16} />
              </Button>
            </div>
            <Outline headings={reading.parsed.headings} active={position.heading} jump={jump} />
          </div>
        )}
      </AppShell>
      <Dialogs state={state} model={model} />
    </SidebarProvider>
  );
}

function Outline({
  headings,
  active,
  jump,
}: {
  headings: Heading[];
  active: string;
  jump: (id: string) => void;
}) {
  return (
    <nav className="article-outline" aria-label="本篇大纲">
      <span className="section-eyebrow">在这篇笔记里</span>
      {headings.length ? (
        <ol>
          {headings.map((heading) => (
            <li key={heading.id} className={heading.depth > 2 ? "outline-sub" : ""}>
              <button
                type="button"
                aria-current={heading.id === active ? "location" : undefined}
                onClick={() => jump(heading.id)}
              >
                {heading.text}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="outline-empty">这一篇，适合一口气读完。</p>
      )}
    </nav>
  );
}

function ReadingSkeleton() {
  return (
    <div
      className="reading-grid skeleton-layout"
      role="status"
      aria-label="正在准备文章"
      aria-busy="true"
    >
      <div className="article">
        <div className="skeleton-eyebrow shimmer" />
        <div className="skeleton-title shimmer" />
        <div className="skeleton-description shimmer" />
        <div className="skeleton-meta shimmer" />
        <div className="skeleton-paragraph">
          {[100, 94, 71, 99, 85, 55].map((width) => (
            <div key={width} className="shimmer" style={{ width: `${width}%` }} />
          ))}
        </div>
        <div className="skeleton-heading shimmer" />
        <div className="skeleton-paragraph">
          {[100, 97, 81].map((width) => (
            <div key={width} className="shimmer" style={{ width: `${width}%` }} />
          ))}
        </div>
      </div>
      <div className="outline-column skeleton-outline">
        <span className="shimmer" />
        <span className="shimmer" />
        <span className="shimmer" />
      </div>
    </div>
  );
}
