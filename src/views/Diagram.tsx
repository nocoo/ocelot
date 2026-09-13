import { useEffect, useId, useState } from "react";
import { renderDiagram } from "../services/diagram";
import { ReaderImage } from "./ReaderImage";
import { useResolvedTheme } from "./useResolvedTheme";

export default function Diagram({
  source,
  onOpenImage,
}: {
  source: string;
  onOpenImage: (src: string, alt: string) => void;
}) {
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
        const image = await renderDiagram(`diagram-${id}`, source, resolvedTheme === "dark");
        if (active) setImage(image);
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
      <ReaderImage
        src={image}
        alt="笔记中的 Mermaid 图示"
        onOpen={onOpenImage}
        onError={() => setFailed(true)}
      />
    </figure>
  ) : (
    <div className="diagram-placeholder shimmer" role="status" aria-label="正在绘制图示" />
  );
}
