import { TableOfContents, TableOfContentsItem } from "@nocoo/basalt/components/table-of-contents";
import { useLayoutEffect, useRef } from "react";
import type { Heading } from "../models/document";

export function ReaderOutline({
  headings,
  active,
  onJump,
}: {
  headings: Heading[];
  active: string;
  onJump: (id: string) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  // The persistent marker measures the rendered Basalt link, including wrapped labels.
  useLayoutEffect(() => {
    const root = body.current;
    const scroll = viewport.current;
    if (!root || !scroll) return;
    const selected = headings.find((heading) => heading.id === active);
    const link = selected
      ? root.querySelector<HTMLElement>(`a[href="#${encodeURIComponent(selected.id)}"]`)
      : null;
    const update = () => {
      root.style.setProperty("--outline-marker-height", `${link?.offsetHeight ?? 0}px`);
      if (link)
        root.style.setProperty(
          "--outline-marker-top",
          `${link.getBoundingClientRect().top - root.getBoundingClientRect().top}px`,
        );
    };
    update();
    if (link) {
      const bounds = link.getBoundingClientRect();
      const frame = scroll.getBoundingClientRect();
      if (bounds.top < frame.top || bounds.bottom > frame.bottom)
        scroll.scrollTop += bounds.top - frame.top - frame.height / 2 + bounds.height / 2;
    }
    const resize = new ResizeObserver(update);
    resize.observe(root);
    return () => resize.disconnect();
  }, [active, headings]);

  return (
    <div className="outline-scroll" ref={viewport}>
      <div
        className="outline-body"
        ref={body}
        onClickCapture={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          const link =
            event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a") : null;
          if (!link) return;
          event.preventDefault();
          onJump(decodeURIComponent(link.hash.slice(1)));
        }}
      >
        <TableOfContents title="在这篇笔记里" className="article-outline">
          {headings.map((heading) => (
            <TableOfContentsItem
              key={heading.id}
              href={`#${encodeURIComponent(heading.id)}`}
              active={heading.id === active}
            >
              <span style={{ paddingInlineStart: Math.max(0, heading.depth - 2) * 12 }}>
                {heading.text}
              </span>
            </TableOfContentsItem>
          ))}
        </TableOfContents>
        <span className="outline-marker" aria-hidden="true" />
        {!headings.length && <p className="outline-empty">这一篇，适合一口气读完。</p>}
      </div>
    </div>
  );
}
