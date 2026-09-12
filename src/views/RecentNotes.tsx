import { Button } from "@nocoo/basalt/components/button";
import { ArrowUpRight, Clock3, LoaderCircle } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { routeUrl } from "../models/links";
import { fileTitle } from "../models/vault";
import type { ReaderState, ReaderViewModel } from "../viewmodels/reader";

export function RecentNotes({
  state,
  model,
  preview = false,
}: {
  state: ReaderState;
  model: ReaderViewModel;
  preview?: boolean;
}) {
  const recent = state.recent;
  const snapshot = state.snapshot;
  const section = useRef<HTMLElement>(null);
  const [height, setHeight] = useState(0);
  const loading = !recent || recent.loading;
  useLayoutEffect(() => {
    // Keep the README in place while the next snapshot's independent list loads.
    if (preview && !loading) setHeight(section.current?.getBoundingClientRect().height ?? 0);
  }, [preview, loading]);
  if (!snapshot) return null;
  return (
    <section
      ref={section}
      className={`recent-notes ${preview ? "recent-preview" : ""}`}
      aria-label="最近更新文章"
      aria-busy={loading}
      style={{ minHeight: preview && loading ? height : undefined }}
    >
      {preview && (
        <div className="recent-heading">
          <h2>
            <Clock3 size={16} aria-hidden="true" />
            最近更新
          </h2>
          <Button variant="ghost" size="sm" onClick={() => model.openDialog("recent")}>
            查看全部
          </Button>
        </div>
      )}
      {!recent || recent.loading ? (
        <p className="recent-status" role="status">
          <LoaderCircle className="spin" size={16} aria-hidden="true" />
          正在载入最近更新…
        </p>
      ) : recent.error ? (
        <div className="recent-status" role="alert">
          <span>{recent.error}</span>
          <Button variant="outline" size="sm" onClick={() => void model.loadRecent()}>
            重试
          </Button>
        </div>
      ) : recent.items.length ? (
        <ol className="recent-list">
          {(preview ? recent.items.slice(0, 5) : recent.items).map((note) => (
            <li key={note.path}>
              <Button variant="ghost" asChild className="recent-link">
                <a
                  href={routeUrl(snapshot.repository.id, note.path)}
                  onClick={(event) => {
                    if (
                      event.button !== 0 ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return;
                    event.preventDefault();
                    void model.selectNote(note.path);
                  }}
                >
                  <span className="recent-title">
                    <strong>{fileTitle(note.path)}</strong>
                    {!preview && <small>{note.path}</small>}
                  </span>
                  <time dateTime={note.updatedAt} title={`更新时间：${note.updatedAt}`}>
                    {note.updatedAt.slice(0, 10)}
                  </time>
                  <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              </Button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="recent-status">这个知识库还没有可展示的文章。</p>
      )}
    </section>
  );
}
