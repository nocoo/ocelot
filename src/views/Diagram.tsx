import { useEffect, useId, useState } from "react";
import { useResolvedTheme } from "./useResolvedTheme";

export default function Diagram({ source }: { source: string }) {
  const id = useId().replace(/[^a-z\d]/giu, "");
  const { resolvedTheme } = useResolvedTheme();
  const [image, setImage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setFailed(false);
    setImage(null);
    async function draw() {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          suppressErrorRendering: true,
          theme: resolvedTheme === "dark" ? "dark" : "neutral",
          maxTextSize: 20_000,
          fontFamily: "system-ui",
          flowchart: { htmlLabels: false, useMaxWidth: true },
        });
        const { svg } = await mermaid.render(`diagram-${id}`, source);
        if (active) setImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      } catch {
        if (active) setFailed(true);
      }
    }
    void draw();
    return () => {
      active = false;
    };
  }, [source, id, resolvedTheme]);
  if (failed)
    return (
      <div className="diagram-error">
        <p>这份图示暂时无法绘制，仍可阅读原始内容。</p>
        <pre>{source}</pre>
      </div>
    );
  return image ? (
    <figure className="diagram">
      <img src={image} alt="笔记中的 Mermaid 图示" />
    </figure>
  ) : (
    <div className="diagram-placeholder shimmer" role="status" aria-label="正在绘制图示" />
  );
}
