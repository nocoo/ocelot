import { Button } from "@nocoo/basalt/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@nocoo/basalt/components/dialog";
import { Input } from "@nocoo/basalt/components/input";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  FileText,
  FlaskConical,
  GitBranch,
  Globe2,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { connectionPresentation } from "../models/connection";
import type { Scenario } from "../models/contracts";
import { fileTitle } from "../models/vault";
import type { ReaderState, ReaderViewModel } from "../viewmodels/reader";
import { RecentNotes } from "./RecentNotes";

const scenarioLabels: Record<Scenario, string> = {
  healthy: "正常阅读",
  slow: "慢速加载",
  expiring: "3 天后到期",
  invalid: "凭据失效",
  limited: "GitHub 限流",
  offline: "上游离线",
  updated: "收到新提交",
};

export function Dialogs({ state, model }: { state: ReaderState; model: ReaderViewModel }) {
  const searchInput = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const connection = connectionPresentation(state.session?.connection ?? null);
  const results = model.searchResults();
  useEffect(() => {
    if (state.dialog === "search") searchInput.current?.focus();
  }, [state.dialog]);
  const title =
    state.dialog === "search"
      ? "寻找一份笔记"
      : state.dialog === "recent"
        ? "最近更新"
        : state.dialog === "repositories"
          ? "我的知识库"
          : state.dialog === "connection"
            ? "阅读连接"
            : state.dialog === "preferences"
              ? "让阅读更合心意"
              : "本地体验场景";
  return (
    <Dialog
      open={state.dialog !== null}
      onOpenChange={(open) => {
        if (!open) model.openDialog(null);
      }}
    >
      <DialogContent
        size="lg"
        className={`ocelot-dialog ${state.dialog === "search" ? "search-dialog" : ""}`}
        onOpenAutoFocus={(event) => {
          returnFocus.current =
            document.activeElement instanceof HTMLElement &&
            document.activeElement !== document.body
              ? document.activeElement
              : document.getElementById("main-content");
          if (state.dialog === "search") {
            event.preventDefault();
            searchInput.current?.focus();
          }
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (model.getSnapshot().dialog !== null) return;
          const target = returnFocus.current?.isConnected
            ? returnFocus.current
            : document.getElementById("main-content");
          target?.focus({ preventScroll: true });
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {state.dialog === "search"
              ? "按文件名与路径搜索当前知识库。"
              : state.dialog === "recent"
                ? "按最近更新时间排列，最多显示 50 篇文章。"
                : state.dialog === "repositories"
                  ? "在自己的知识之间，自由往来。"
                  : state.dialog === "connection"
                    ? "只读访问 GitHub，安心留在文字里。"
                    : state.dialog === "preferences"
                      ? "一点调整，找到适合自己的节奏。"
                      : "所有仓库与凭据均为合成数据，可放心切换。"}
          </DialogDescription>
        </DialogHeader>
        {state.dialog === "recent" && <RecentNotes state={state} model={model} />}
        {state.dialog === "search" && (
          <>
            <div className="dialog-search-field">
              <Search size={18} aria-hidden="true" />
              <Input
                ref={searchInput}
                value={state.query}
                onChange={(event) => model.setQuery(event.target.value)}
                aria-label="搜索笔记"
                placeholder="一个标题、一条路径，或一个词…"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && results[0]) void model.selectNote(results[0].path);
                }}
              />
            </div>
            <section className="search-results" aria-label="搜索结果">
              <p className="section-eyebrow">
                {state.query
                  ? `${results.length === 100 ? "100+" : results.length} 个结果`
                  : "从这里开始"}
              </p>
              {results.slice(0, 60).map((file) => (
                <Button
                  variant="ghost"
                  key={file.path}
                  className="search-result"
                  onClick={() => {
                    void model.selectNote(file.path);
                  }}
                >
                  <FileText size={17} aria-hidden="true" />
                  <span>
                    <strong>{fileTitle(file.path)}</strong>
                    <small>{file.path}</small>
                  </span>
                  <ArrowUpRight size={15} aria-hidden="true" />
                </Button>
              ))}
              {!results.length && (
                <div className="dialog-empty">
                  <Search size={25} aria-hidden="true" />
                  <p>还没有找到这份笔记</p>
                  <small>试试更短的标题，或目录中的一个词。</small>
                </div>
              )}
            </section>
            <div className="dialog-footnote">
              <span>
                <kbd>↵</kbd> 打开第一项
              </span>
              <span>
                <kbd>esc</kbd> 返回阅读
              </span>
            </div>
          </>
        )}
        {state.dialog === "repositories" && (
          <>
            <div className="repository-list">
              {state.repositories.map((repository) => (
                <div className="repository-row" key={repository.id}>
                  <Button
                    variant="ghost"
                    className="repository-open"
                    onClick={() => {
                      void model.selectRepository(repository.id);
                    }}
                  >
                    <span className="repo-icon">
                      <BookOpen size={20} aria-hidden="true" />
                    </span>
                    <span>
                      <strong>{repository.name}</strong>
                      <small>
                        {repository.owner} · {repository.private ? "私有知识库" : "公开知识库"}
                      </small>
                    </span>
                    {state.snapshot?.repository.id === repository.id ? (
                      <Check size={16} aria-label="当前知识库" />
                    ) : (
                      <ChevronRight size={16} aria-hidden="true" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="remove-repository"
                    aria-label={`移除 ${repository.name}`}
                    disabled={state.removing !== null}
                    onClick={() => {
                      void model.removeRepository(repository.id);
                    }}
                  >
                    {state.removing === repository.id ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </Button>
                </div>
              ))}
            </div>
            <form
              className="add-repository"
              onSubmit={(event) => {
                event.preventDefault();
                void model.addRepository();
              }}
            >
              <label htmlFor="repository-address">添加 GitHub 知识库</label>
              <p>支持公开和私有仓库，使用当前连接的只读权限。</p>
              <div>
                <Input
                  id="repository-address"
                  placeholder="owner/repository 或 GitHub 仓库地址"
                  value={state.repositoryInput}
                  onChange={(event) => model.setRepositoryInput(event.target.value)}
                  required
                  disabled={state.adding}
                  autoComplete="off"
                />
                <Button type="submit" disabled={state.adding || !state.repositoryInput.trim()}>
                  {state.adding ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}
                  <span>{state.adding ? "正在连接" : "添加"}</span>
                </Button>
              </div>
            </form>
            {state.session?.local && (
              <div className="local-suggestion">
                <FlaskConical size={14} aria-hidden="true" />
                <span>试试另一个示例：</span>
                <button
                  type="button"
                  onClick={() => model.setRepositoryInput("ocelot-demo/reading-room")}
                >
                  ocelot-demo/reading-room
                </button>
              </div>
            )}
            <p className="subtle-note">
              <ShieldCheck size={14} aria-hidden="true" />
              移除只会清理 Ocelot 中的登记与缓存，GitHub 文件始终保持原样。
            </p>
          </>
        )}
        {state.dialog === "connection" && (
          <>
            <div className={`connection-card ${connection.tone}`}>
              <span className="connection-symbol">
                <KeyRound size={24} aria-hidden="true" />
              </span>
              <div>
                <strong>{connection.label}</strong>
                <p>{connection.detail}</p>
              </div>
            </div>
            <dl className="connection-details">
              <div>
                <dt>
                  <LockKeyhole size={15} aria-hidden="true" /> 访问范围
                </dt>
                <dd>选定的 GitHub 仓库 · 只读</dd>
              </div>
              <div>
                <dt>
                  <Globe2 size={15} aria-hidden="true" /> 阅读空间
                </dt>
                <dd>{state.session?.email}</dd>
              </div>
              <div>
                <dt>
                  <GitBranch size={15} aria-hidden="true" /> 凭据有效期
                </dt>
                <dd>
                  {state.session?.connection.expiresAt
                    ? new Date(state.session.connection.expiresAt).toLocaleDateString("zh-CN")
                    : "暂未提供"}
                </dd>
              </div>
            </dl>
            <details className="rotation-details">
              <summary>
                如何更新连接 <ChevronRight size={14} aria-hidden="true" />
              </summary>
              <ol>
                <li>
                  在 GitHub 创建新的 fine-grained PAT，选择知识库仓库，授予 Contents 只读权限。
                </li>
                <li>
                  在 Cloudflare Worker 中更新 <code>GITHUB_TOKEN</code> Secret；如 GitHub
                  未返回到期日，同时更新 <code>GITHUB_TOKEN_EXPIRES_AT</code>。
                </li>
                <li>回到这里重新检查，无需重新添加知识库。</li>
              </ol>
            </details>
            <div className="dialog-actions">
              <span>到期前 7 天会在侧栏提醒</span>
              <Button
                onClick={() => {
                  void model.recheckConnection();
                }}
                disabled={
                  state.checkingConnection || (state.session?.connection.retryAt ?? 0) > Date.now()
                }
              >
                {state.checkingConnection ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <ShieldCheck size={16} />
                )}
                重新检查
              </Button>
            </div>
          </>
        )}
        {state.dialog === "preferences" && (
          <>
            <div className="reading-sample" style={{ fontSize: `${18 * state.fontScale}px` }}>
              <span>Read slowly.</span>
              <p>让文字有呼吸，让思绪有余地。</p>
            </div>
            <fieldset className="font-options" aria-label="阅读字号">
              {[
                [0.9, "紧凑"],
                [1, "适中"],
                [1.15, "舒展"],
                [1.3, "大字"],
              ].map(([value, label]) => (
                <Button
                  key={value}
                  variant={state.fontScale === value ? "default" : "outline"}
                  onClick={() => model.setFontScale(Number(value))}
                  aria-pressed={state.fontScale === value}
                >
                  <span
                    className="font-option-symbol"
                    style={{ fontSize: `${16 * Number(value)}px` }}
                  >
                    Aa
                  </span>
                  <span>{label}</span>
                </Button>
              ))}
            </fieldset>
            <fieldset className="width-options" aria-label="正文宽度">
              <legend>正文宽度</legend>
              <Button
                variant={state.fullWidth ? "outline" : "default"}
                aria-pressed={!state.fullWidth}
                onClick={() => model.setFullWidth(false)}
              >
                舒适行宽
              </Button>
              <Button
                variant={state.fullWidth ? "default" : "outline"}
                aria-pressed={state.fullWidth}
                onClick={() => model.setFullWidth(true)}
              >
                全宽
              </Button>
            </fieldset>
            <p className="subtle-note">偏好仅保存在这个浏览器，笔记内容不会写入本地存储。</p>
          </>
        )}
        {state.dialog === "local" && (
          <>
            <div className="scenario-grid">
              {(Object.entries(scenarioLabels) as [Scenario, string][]).map(([value, label]) => (
                <Button
                  key={value}
                  variant={state.local?.scenario === value ? "default" : "outline"}
                  onClick={() => {
                    void model.setScenario(value);
                  }}
                  disabled={state.checkingConnection}
                >
                  {state.local?.scenario === value && <Check size={14} />}
                  {label}
                </Button>
              ))}
            </div>
            <p className="subtle-note">
              选择「慢速加载」后打开一篇尚未读过的笔记，可以体验内容交接；「收到新提交」会出现可应用的版本提示。
            </p>
            <div className="mock-stats">
              <span className="section-eyebrow">模拟 GitHub 请求</span>
              {Object.entries(state.local?.requests ?? {}).map(([kind, count]) => (
                <span key={kind}>
                  <code>{kind}</code>
                  <strong>{count}</strong>
                </span>
              ))}
            </div>
          </>
        )}
        {state.error && (
          <p className="dialog-error" role="alert">
            {state.error.message}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
