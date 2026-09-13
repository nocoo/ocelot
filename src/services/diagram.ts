export async function renderDiagram(id: string, source: string, dark: boolean): Promise<string> {
  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    secure: [...(mermaid.mermaidAPI.defaultConfig.secure ?? []), "htmlLabels"],
    theme: dark ? "dark" : "neutral",
    maxTextSize: 20_000,
    fontFamily: "system-ui",
    htmlLabels: false,
  });
  const { svg } = await mermaid.render(id, source);
  // Mermaid's generated root needs intrinsic dimensions when displayed as an image.
  const sized = svg.replace(/<svg\b[^>]*>/u, (root) => {
    const box = root
      .match(/\sviewBox="([^"]+)"/u)?.[1]
      .trim()
      .split(/[\s,]+/u)
      .map(Number);
    if (box?.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) return root;
    return root
      .replace(/\s(?:width|height)="[^"]*"/gu, "")
      .replace("<svg", `<svg width="${box[2]}" height="${box[3]}"`);
  });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
}
