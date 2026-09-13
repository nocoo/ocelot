import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderDiagram } from "../../src/services/diagram";

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
  mermaidAPI: {
    defaultConfig: { secure: ["securityLevel", "maxTextSize"] as string[] | undefined },
  },
}));
vi.mock("mermaid", () => ({ default: mermaid }));

beforeEach(() => {
  vi.resetAllMocks();
  mermaid.mermaidAPI.defaultConfig.secure = ["securityLevel", "maxTextSize"];
});

describe("Mermaid images", () => {
  it.each([false, true])("keeps source and security boundaries in dark=%s", async (dark) => {
    const source = "stateDiagram-v2\n  Empty --> Ready: 笔记<br/>就绪";
    const svg = '<svg viewBox="-4 2 800.5 640"><text>中文 &amp; English</text></svg>';
    mermaid.render.mockResolvedValue({ svg });
    const uri = await renderDiagram("example", source, dark);
    expect(mermaid.render).toHaveBeenCalledWith("example", source);
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        startOnLoad: false,
        securityLevel: "strict",
        suppressErrorRendering: true,
        maxTextSize: 20_000,
        htmlLabels: false,
        secure: ["securityLevel", "maxTextSize", "htmlLabels"],
        theme: dark ? "dark" : "neutral",
      }),
    );
    expect(uri).toMatch(/^data:image\/svg\+xml;charset=utf-8,/u);
    expect(decodeURIComponent(uri.split(",")[1])).toBe(
      '<svg width="800.5" height="640" viewBox="-4 2 800.5 640"><text>中文 &amp; English</text></svg>',
    );
  });

  it("sizes only the generated root and retains its aspect ratio and nested elements", async () => {
    const inner = '<svg width="40" height="20" viewBox="0 0 4 2"><rect width="4"/></svg>';
    mermaid.render.mockResolvedValue({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style="max-width: 900px;" viewBox="0, 0, 900, 700">${inner}</svg>`,
    });
    const uri = await renderDiagram("sized", "flowchart LR\n A --> B", false);
    expect(decodeURIComponent(uri.split(",")[1])).toBe(
      `<svg width="900" height="700" xmlns="http://www.w3.org/2000/svg" style="max-width: 900px;" viewBox="0, 0, 900, 700">${inner}</svg>`,
    );
  });

  it.each([undefined, "", "0 0 10", "NaN 0 10 20", "0 0 Infinity 10", "0 0 -1 10", "0 0 10 0"])(
    "retains the original dimensions when viewBox=%s is unusable",
    async (box) => {
      const svg = `<svg width="100" height="50"${box === undefined ? "" : ` viewBox="${box}"`}></svg>`;
      mermaid.render.mockResolvedValue({ svg });
      const uri = await renderDiagram("fallback", "graph LR", false);
      expect(decodeURIComponent(uri.split(",")[1])).toBe(svg);
    },
  );

  it("protects SVG labels when Mermaid has no extra secure defaults", async () => {
    mermaid.mermaidAPI.defaultConfig.secure = undefined;
    mermaid.render.mockResolvedValue({ svg: '<svg width="100" height="50"/>' });
    await renderDiagram("defaults", "graph LR", false);
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ secure: ["htmlLabels"] }),
    );
  });

  it("propagates rendering failures so the view can show escaped source", async () => {
    const failure = new Error("Invalid diagram");
    mermaid.render.mockRejectedValue(failure);
    await expect(renderDiagram("invalid", "stateDiagram-v2\n Empty -->", false)).rejects.toBe(
      failure,
    );
  });
});
