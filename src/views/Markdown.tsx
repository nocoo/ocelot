import { BookOpen, FileQuestion, ImageOff } from "lucide-react";
import { lazy, Suspense, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { Snapshot } from "../models/contracts";
import { readingSchema, rehypeReadingAnchors, remarkObsidian } from "../models/document";
import { renderUrl } from "../models/links";
import { readRoute } from "../services/browser";
import type { Reading } from "../viewmodels/reader";

const Diagram = lazy(() => import("./Diagram"));

export function Markdown({
  reading,
  snapshot,
  onNavigate,
}: {
  reading: Reading;
  snapshot: Snapshot;
  onNavigate: (path: string, anchor?: string) => void;
}) {
  const components = useMemo<Components>(
    () => ({
      a: ({ href, children, title }) => {
        if (!href)
          return (
            <span className="unresolved-link" title="当前知识库中找不到这个链接">
              {children}
            </span>
          );
        const internal = href.startsWith("/?");
        return (
          <a
            href={href}
            title={title}
            target={internal ? undefined : "_blank"}
            rel={internal ? undefined : "noopener noreferrer"}
            onClick={
              internal
                ? (event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    const route = readRoute(new URL(href, window.location.origin).href);
                    if (route.path) onNavigate(route.path, route.anchor);
                  }
                : undefined
            }
          >
            {children}
          </a>
        );
      },
      img: ({ src, alt, node }) => {
        const target = node?.properties.dataEmbed;
        const preview = typeof target === "string" ? reading.embeds[target] : undefined;
        if (preview)
          return (
            <aside className="note-embed" aria-label="嵌入笔记">
              <span className="embed-label">
                <BookOpen size={14} aria-hidden="true" /> 来自另一份笔记
              </span>
              <strong>{preview.title}</strong>
              {preview.loading ? (
                <span
                  className="embed-skeleton shimmer"
                  role="status"
                  aria-label="正在准备嵌入内容"
                />
              ) : (
                <p>
                  {preview.unavailable ? "暂时无法读取这段内容，请稍后重新打开。" : preview.text}
                </p>
              )}
              <a
                href={preview.href}
                onClick={(event) => {
                  event.preventDefault();
                  const route = readRoute(new URL(preview.href, window.location.origin).href);
                  if (route.path) onNavigate(route.path, route.anchor);
                }}
              >
                阅读完整笔记 <span aria-hidden="true">↗</span>
              </a>
            </aside>
          );
        if (!src || src.startsWith("/?"))
          return (
            <span className="image-unavailable">
              <ImageOff size={16} aria-hidden="true" />
              {alt || "图片暂不可用"}
            </span>
          );
        return <img src={src} alt={alt ?? ""} loading="lazy" decoding="async" />;
      },
      pre: ({ children, node }) => {
        const child = node?.children[0];
        const classes = child?.type === "element" ? child.properties.className : [];
        if (
          Array.isArray(classes) &&
          classes.includes("language-mermaid") &&
          child?.type === "element"
        ) {
          const source = child.children
            .map((part) => (part.type === "text" ? part.value : ""))
            .join("");
          return (
            <Suspense
              fallback={
                <div
                  className="diagram-placeholder shimmer"
                  role="status"
                  aria-label="正在绘制图示"
                />
              }
            >
              <Diagram source={source} />
            </Suspense>
          );
        }
        return <pre>{children}</pre>;
      },
      table: ({ children }) => (
        // biome-ignore lint/a11y/noNoninteractiveTabindex: A scrollable table needs keyboard focus for horizontal scrolling.
        <section className="table-scroll" tabIndex={0} aria-label="表格，可横向滚动">
          <table>{children}</table>
        </section>
      ),
    }),
    [reading.embeds, onNavigate],
  );

  if (reading.assetUrl && reading.assetType) {
    const type = reading.assetType;
    if (type.startsWith("image/"))
      return (
        <div className="asset-preview">
          <img src={reading.assetUrl} alt={reading.parsed.title} />
        </div>
      );
    if (type.startsWith("audio/"))
      return (
        <audio controls src={reading.assetUrl}>
          <track kind="captions" />
          浏览器不支持音频预览。
        </audio>
      );
    if (type.startsWith("video/"))
      return (
        <video controls src={reading.assetUrl}>
          <track kind="captions" />
          浏览器不支持视频预览。
        </video>
      );
    return (
      <div className="attachment-download">
        <FileQuestion size={32} aria-hidden="true" />
        <p>此附件可以下载后阅读。</p>
        <a href={reading.assetUrl}>下载附件</a>
      </div>
    );
  }
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath, remarkObsidian]}
      rehypePlugins={[
        rehypeRaw,
        [rehypeSanitize, readingSchema],
        rehypeReadingAnchors,
        [rehypeKatex, { trust: false, strict: "ignore", maxExpand: 1000, maxSize: 20 }],
      ]}
      components={components}
      urlTransform={(url, property) => renderUrl(url, property === "src", reading.path, snapshot)}
    >
      {reading.parsed.markdown}
    </ReactMarkdown>
  );
}
