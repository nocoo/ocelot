import { AppHeader } from "@nocoo/basalt/components/app-header";
import { AppMain, AppShell, AppSkipLink } from "@nocoo/basalt/components/app-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@nocoo/basalt/components/avatar";
import { Badge } from "@nocoo/basalt/components/badge";
import { Button } from "@nocoo/basalt/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@nocoo/basalt/components/dialog";
import { Empty } from "@nocoo/basalt/components/empty";
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
  ExternalLink,
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
import { version } from "../../package.json";
import { connectionPresentation } from "../models/connection";
import { changedFiles, fileTitle, isMarkdown } from "../models/vault";
import type { ReaderViewModel } from "../viewmodels/reader";
import { Dialogs } from "./Dialogs";
import { GitHubMark } from "./GitHubMark";
import { Mark } from "./Mark";
import { Markdown } from "./Markdown";
import { NavigationTree } from "./NavigationTree";
import { ReaderBreadcrumbs } from "./ReaderBreadcrumbs";
import { ImageLightbox } from "./ReaderImage";
import { ReaderOutline } from "./ReaderOutline";
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
  const outlineButton = useRef<HTMLButtonElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ progress: 0, heading: "", scrolled: false });
  const connection = connectionPresentation(state.session?.connection ?? null);
  const identity = model.identity();
  const snapshot = state.snapshot;
  const reading = state.reading;
  const githubDocumentUrl = model.githubDocumentUrl();
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
  const openImage = useCallback((src: string, alt: string) => model.openImage(src, alt), [model]);
  const jump = useCallback((id: string) => model.jumpToHeading(id), [model]);

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
    const behavior =
      state.navigation.smooth && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "smooth"
        : "instant";
    if (state.navigation.anchor)
      document
        .getElementById(state.navigation.anchor)
        ?.scrollIntoView({ behavior, block: "start" });
    else if (!state.navigation.preserve) container.scrollTo({ top: 0, behavior });
  }, [state.navigation]);
  useEffect(() => {
    const container = scroller.current;
    if (!container) return;
    const update = () => {
      container.style.setProperty("--reading-height", `${container.clientHeight}px`);
      const height = container.scrollHeight - container.clientHeight;
      const headings = state.raw ? [] : (reading?.parsed.headings ?? []);
      const top = container.getBoundingClientRect().top + 100;
      let active = headings[0]?.id ?? "";
      for (const heading of headings) {
        const element = document.getElementById(heading.id);
        if (element && element.getBoundingClientRect().top <= top) active = heading.id;
      }
      if (height > 0 && container.scrollTop >= height - 2) active = headings.at(-1)?.id ?? "";
      setPosition({
        progress:
          height <= 0 ? 100 : Math.min(100, Math.round((container.scrollTop / height) * 100)),
        heading: active,
        scrolled: container.scrollTop > 0,
      });
    };
    update();
    container.addEventListener("scroll", update, { passive: true });
    const resize = new ResizeObserver(update);
    resize.observe(container);
    if (container.firstElementChild) resize.observe(container.firstElementChild);
    return () => {
      container.removeEventListener("scroll", update);
      resize.disconnect();
    };
  }, [reading, state.raw]);
  useEffect(() => {
    document.title = reading ? `${reading.parsed.title} · Ocelot` : "Ocelot · 私人阅读室";
  }, [reading]);

  const avatar = (
    <Avatar className="identity-avatar" title={identity.name}>
      <AvatarImage src={identity.avatar} alt={identity.name} />
      <AvatarFallback className="identity-icon">
        {identity.local ? <LockKeyhole size={16} aria-hidden="true" /> : identity.initial}
      </AvatarFallback>
    </Avatar>
  );
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
          <SidebarHeader className="brand-header">
            <a className="brand" href="/" aria-label="Ocelot 首页" title={`Ocelot v${version}`}>
              <Mark />
              {!railCollapsed && (
                <>
                  <span className="brand-name">ocelot</span>
                  <Badge variant="secondary" className="version-pill">
                    v{version}
                  </Badge>
                </>
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
            ) : state.booting || state.loading ? (
              <div className="tree-skeleton" aria-hidden="true">
                {[76, 90, 66, 83, 58, 72].map((width, index) => (
                  <span
                    key={width}
                    className="shimmer"
                    style={{ width: `${width}%`, marginLeft: index % 2 ? 18 : 0 }}
                  />
                ))}
              </div>
            ) : (
              <Empty
                className="tree-empty"
                icon={<BookOpen aria-hidden="true" />}
                title={
                  state.error
                    ? "目录暂未载入"
                    : state.repositories.length
                      ? "选择一个知识库"
                      : "还没有知识库"
                }
                description={
                  state.error?.message ??
                  (state.repositories.length
                    ? "打开已连接的知识库，继续阅读。"
                    : "添加 GitHub 仓库后，目录会显示在这里。")
                }
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => model.openDialog("repositories")}
                  >
                    {state.repositories.length ? "选择知识库" : "添加知识库"}
                  </Button>
                }
              />
            )}
          </SidebarNav>
          <SidebarFooter className={`sidebar-bottom ${railCollapsed ? "is-collapsed" : ""}`}>
            {railCollapsed ? (
              <>
                <SidebarIconItem
                  className={`connection-shortcut ${connection.tone}`}
                  aria-label={`阅读连接：${connection.label}`}
                  title={connection.label}
                  onClick={() => model.openDialog("connection")}
                >
                  <Link2 size={18} />
                  <span className="status-dot" />
                </SidebarIconItem>
                {avatar}
              </>
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
                  name={identity.name}
                  email={identity.subtitle}
                  avatar={avatar}
                  action={
                    <ShieldCheck
                      size={17}
                      aria-label={identity.local ? "本地阅读空间" : "受 Cloudflare Access 保护"}
                    />
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
                  onClick={(event) => {
                    // Safari does not focus a button on tap; give the drawer a real return target.
                    event.currentTarget.focus({ preventScroll: true });
                    setCollapsed(!collapsed);
                  }}
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
                <fieldset className="reader-options" aria-label="阅读器选项">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="chrome-button width-button"
                    aria-label="全宽阅读"
                    title={state.fullWidth ? "恢复舒适行宽" : "全宽阅读"}
                    aria-pressed={state.fullWidth}
                    disabled={!reading}
                    onClick={() => model.setFullWidth(!state.fullWidth)}
                  >
                    全宽
                  </Button>
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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="chrome-button raw-button"
                    aria-label={state.raw ? "返回文章阅读" : "查看 Markdown 原文"}
                    title={state.raw ? "返回文章阅读" : "查看 Markdown 原文"}
                    aria-pressed={state.raw}
                    disabled={!reading || !!reading.assetType}
                    onClick={() => model.setRaw(!state.raw)}
                  >
                    {state.raw ? <BookOpen size={17} /> : <span>Raw</span>}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="chrome-button"
                    aria-label="在 GitHub 打开 Markdown"
                    title="在 GitHub 打开 Markdown"
                    asChild={!!githubDocumentUrl}
                    disabled={!githubDocumentUrl}
                  >
                    {githubDocumentUrl ? (
                      <a href={githubDocumentUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink size={17} />
                      </a>
                    ) : (
                      <ExternalLink size={17} />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="chrome-button mobile-outline-button"
                    ref={outlineButton}
                    aria-label="文章大纲"
                    title="文章大纲"
                    aria-expanded={state.outlineOpen}
                    onClick={() => model.setOutlineOpen(!state.outlineOpen)}
                    disabled={state.raw || !reading?.parsed.headings.length}
                  >
                    <ListTree size={17} />
                  </Button>
                </fieldset>
                <fieldset className="global-actions" aria-label="全局操作">
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
                  <ThemeButton />
                  {state.session?.local && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="chrome-button"
                      aria-label="本地体验场景"
                      title="本地体验场景"
                      onClick={() => model.openDialog("local")}
                    >
                      <FlaskConical size={17} />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="chrome-button" asChild>
                    <a
                      href="https://github.com/nocoo/ocelot"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Ocelot GitHub 仓库"
                      title="Ocelot GitHub 仓库"
                    >
                      <GitHubMark />
                    </a>
                  </Button>
                </fieldset>
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
                  <div
                    className={`reading-grid ${state.fullWidth ? "is-full-width" : ""} ${state.raw ? "is-raw" : ""}`}
                  >
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
                      {state.raw ? (
                        // biome-ignore lint/a11y/noNoninteractiveTabindex: Raw Markdown can scroll horizontally with the keyboard.
                        <section className="raw-markdown" tabIndex={0} aria-label="Markdown 原文">
                          <pre>
                            <code>{reading.content}</code>
                          </pre>
                        </section>
                      ) : (
                        <div className="prose">
                          <Markdown
                            reading={reading}
                            snapshot={snapshot}
                            onNavigate={navigate}
                            onOpenImage={openImage}
                          />
                        </div>
                      )}
                      <footer className="article-footer">
                        <Mark small />
                        <span>留一点空白，给下一个想法。</span>
                      </footer>
                    </article>
                    {!state.raw && (
                      <aside className="outline-column" aria-label="文章大纲">
                        <div className="reading-progress">
                          <span>阅读进度</span>
                          <span>{position.progress}%</span>
                          <div>
                            <i style={{ width: `${position.progress}%` }} />
                          </div>
                        </div>
                        <ReaderOutline
                          headings={reading.parsed.headings}
                          active={position.heading}
                          onJump={jump}
                        />
                        <div className="quiet-note">
                          <span className="quiet-note-line" />
                          <p>
                            慢慢读，
                            <br />
                            让想法停留片刻。
                          </p>
                        </div>
                      </aside>
                    )}
                  </div>
                ) : state.loading || state.booting ? (
                  <ReadingSkeleton />
                ) : (
                  <div className="empty-reading">
                    <img
                      className="empty-reading-art"
                      src="/logo-presentation-256.webp"
                      srcSet="/logo-presentation-256.webp 256w, /logo-presentation-512.webp 512w"
                      sizes="(max-width: 767px) 144px, 192px"
                      width="192"
                      height="192"
                      alt=""
                      aria-hidden="true"
                    />
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
              {reading && (
                <Button
                  variant="outline"
                  size="icon"
                  className="back-to-top"
                  aria-label="回到文章顶部"
                  title="回到文章顶部"
                  disabled={!position.scrolled}
                  onClick={() => model.scrollToTop()}
                >
                  <ArrowUp size={17} />
                </Button>
              )}
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
      </AppShell>
      <Dialog open={state.outlineOpen} onOpenChange={(open) => model.setOutlineOpen(open)}>
        <DialogContent
          className="ocelot-dialog mobile-outline"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            outlineButton.current?.focus({ preventScroll: true });
          }}
        >
          <div className="outline-dialog-header">
            <DialogTitle>文章大纲</DialogTitle>
            <DialogClose asChild>
              <Button size="icon" variant="ghost" aria-label="关闭文章大纲">
                <X size={16} />
              </Button>
            </DialogClose>
          </div>
          <DialogDescription className="sr-only">滚动目录，选择要阅读的章节。</DialogDescription>
          <ReaderOutline
            headings={reading?.parsed.headings ?? []}
            active={position.heading}
            onJump={jump}
          />
        </DialogContent>
      </Dialog>
      <ImageLightbox image={state.lightbox} model={model} />
      <Dialogs state={state} model={model} />
    </SidebarProvider>
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
