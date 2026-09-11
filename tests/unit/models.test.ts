import type { Root as HtmlRoot } from "hast";
import type { Root } from "mdast";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";
import { connectionPresentation } from "../../src/models/connection";
import type { Connection, Snapshot, VaultFile } from "../../src/models/contracts";
import {
  embedExcerpt,
  parseDocument,
  readingSchema,
  rehypeReadingAnchors,
  remarkObsidian,
} from "../../src/models/document";
import { anchorId, headingSlug, renderUrl, resolveLink, routeUrl } from "../../src/models/links";
import {
  attachmentType,
  canonicalPath,
  changedFiles,
  contentUrl,
  fileTitle,
  initialDocument,
  isMarkdown,
  parseRepository,
  searchFiles,
} from "../../src/models/vault";

const file = (path: string, sha = "a".repeat(40)): VaultFile => ({ path, sha, size: 100 });
const files = [
  file("README.md"),
  file("Folder/Current.md"),
  file("Folder/Local.md"),
  file("Folder/Space name.md"),
  file("Folder/中文.md"),
  file("Other/Unique.md"),
  file("a/Duplicate.md"),
  file("b/Duplicate.md"),
  file("附件/photo.png"),
  file("unsafe.svg"),
  file("Long.markdown"),
];
const snapshot: Snapshot = {
  repository: {
    id: 101,
    owner: "demo",
    name: "garden",
    branch: "main",
    private: true,
    description: "",
    commitSha: "b".repeat(40),
    treeSha: "c".repeat(40),
    checkedAt: 0,
    authorization: "allowed",
  },
  files,
  treeSha: "c".repeat(40),
  commitSha: "b".repeat(40),
};

describe("vault boundaries and navigation", () => {
  it.each([
    "",
    "../secret.md",
    "a/../b.md",
    "/absolute.md",
    "a//b.md",
    ".obsidian/state.json",
    "a/.env",
    "a\\b.md",
    "a\0.md",
    "a\u001f.md",
    "a\u007f.md",
    "x".repeat(1025),
  ])("rejects noncanonical or hidden path %j", (path) => expect(canonicalPath(path)).toBeNull());
  it("preserves legitimate Unicode and literal percent names without a second decode", () => {
    expect(canonicalPath("笔记/2026 09/100%.md")).toBe("笔记/2026 09/100%.md");
    expect(canonicalPath("%2e%2e.md")).toBe("%2e%2e.md");
  });
  it.each(["nocoo/obsidian", " https://github.com/nocoo/obsidian.git/ "])(
    "accepts repository input %s",
    (input) => expect(parseRepository(input)).toEqual({ owner: "nocoo", name: "obsidian" }),
  );
  it.each([
    "http://github.com/a/b",
    "https://evil.test/a/b",
    "https://github.com/a/b?token=x",
    "a/..",
    "a/.",
    "a/.git",
    "a/b/tree/main",
    "a/b#note",
    "a@evil.test/b",
    "/a/b",
  ])("rejects repository input %s", (input) => expect(parseRepository(input)).toBeNull());
  it("picks a welcome note, falls back to a note, and treats attachments separately", () => {
    expect(initialDocument(files)).toBe("README.md");
    expect(initialDocument([file("b.MD"), file("欢迎.md")])).toBe("欢迎.md");
    expect(initialDocument([file("folder/a.md")])).toBe("folder/a.md");
    expect(initialDocument([file("image.png")])).toBeNull();
    expect(initialDocument([])).toBeNull();
    expect(fileTitle("Folder/a.MARKDOWN")).toBe("a");
    expect(isMarkdown("x.markdown")).toBe(true);
    expect(isMarkdown("x.md.exe")).toBe(false);
    expect(attachmentType("Photo.JPG")).toBe("image/jpeg");
    expect(attachmentType("")).toBeNull();
    expect(attachmentType("x.svg")).toBeNull();
  });
  it("compares immutable SHAs and includes deletions", () => {
    expect(
      changedFiles(
        [file("old.md"), file("change.md"), file("same.md")],
        [file("new.md"), file("change.md", "b".repeat(40)), file("same.md")],
      ),
    ).toEqual({ "old.md": "deleted", "change.md": "modified", "new.md": "added" });
    expect(changedFiles([], [])).toEqual({});
  });
  it("searches every query term without reading document bodies and bounds results", () => {
    expect(searchFiles(files, " FOLDER  space ")).toEqual([files[3]]);
    expect(searchFiles(files, "中文")).toEqual([files[4]]);
    expect(searchFiles(files, "photo")).toEqual([]);
    expect(
      searchFiles(
        Array.from({ length: 150 }, (_, index) => file(`${index}.md`)),
        "",
      ),
    ).toHaveLength(100);
    expect(contentUrl(101, "tree", "笔记/a b.md")).toContain("/document?tree=tree&path=");
    expect(contentUrl(101, "tree", "a.png", true)).toBe(
      "/api/repositories/101/asset?tree=tree&path=a.png",
    );
  });
});

describe("Obsidian destinations", () => {
  it.each([
    ["Local", true, "Folder/Local.md"],
    ["./Local.md", false, "Folder/Local.md"],
    ["../README.md", false, "README.md"],
    ["/README.md", false, "README.md"],
    ["Space%20name.md", false, "Folder/Space name.md"],
    ["中文", true, "Folder/中文.md"],
    ["Unique", true, "Other/Unique.md"],
    ["unique", true, "Other/Unique.md"],
    ["Other/Unique", true, "Other/Unique.md"],
    ["Long", true, "Long.markdown"],
  ])("resolves %s against one snapshot", (href, wiki, path) =>
    expect(resolveLink(String(href), "Folder/Current.md", files, Boolean(wiki))).toMatchObject({
      kind: "note",
      path,
    }),
  );
  it.each([
    "%zz",
    "",
    "\u0000x",
    "javascript:alert(1)",
    "data:text/html,x",
    "//evil.test/a",
    "../../README.md",
    "../.env",
    "Missing",
    "Duplicate",
    "unsafe.svg",
  ])("does not guess or execute %s", (href) =>
    expect(resolveLink(href, "Folder/Current.md", files, true).kind).toBe("missing"),
  );
  it("keeps note anchors in a namespace that cannot clobber the DOM", () => {
    expect(headingSlug("Hello, 世界! **Again**")).toBe("hello-世界-again");
    expect(anchorId("^future-entry")).toBe("block-future-entry");
    expect(resolveLink("#A heading", "README.md", files)).toEqual({
      kind: "note",
      path: "README.md",
      anchor: "note-a-heading",
    });
    expect(resolveLink("README#^block", "Folder/Current.md", files, true).anchor).toBe(
      "block-block",
    );
    expect(routeUrl(101, "Folder/Space name.md", "note-中文")).toContain(
      "#note-%E4%B8%AD%E6%96%87",
    );
    expect(routeUrl(101, "README.md")).not.toContain("#");
  });
  it("allows explicit external links while withholding external image requests", () => {
    expect(resolveLink("https://example.org/a", "README.md", files).kind).toBe("external");
    expect(resolveLink("mailto:reader@example.org", "README.md", files).kind).toBe("external");
    expect(renderUrl("https://tracker.test/pixel", true, "README.md", snapshot)).toBe("");
    expect(renderUrl("https://example.org", false, "README.md", snapshot)).toBe(
      "https://example.org",
    );
    expect(renderUrl("ocelot-wiki:Other%2FUnique", false, "README.md", snapshot)).toBe(
      routeUrl(101, "Other/Unique.md"),
    );
    expect(renderUrl("ocelot-embed:附件%2Fphoto.png", true, "README.md", snapshot)).toBe(
      contentUrl(101, snapshot.treeSha, "附件/photo.png", true),
    );
    expect(renderUrl("missing.md", false, "README.md", snapshot)).toBe("");
  });
});

describe("document models and safe Markdown", () => {
  it("uses the first H1 over frontmatter titles and preserves mixed-language hierarchy", () => {
    const parsed = parseDocument(
      "\uFEFF---\r\ntitle: Ignored\r\ndescription: A garden\r\ntags: [reading, 123, 中文]\r\n---\r\n# Real *title*\r\n\r\nHello 世界.\n\n## A **heading**\n## A heading\n### 中文标题\n",
      "fallback.md",
    );
    expect(parsed).toMatchObject({
      title: "Real title",
      description: "A garden",
      tags: ["reading", "中文"],
      minutes: 1,
    });
    expect(parsed.markdown).not.toContain("# Real");
    expect(parsed.headings).toEqual([
      { id: "note-a-heading", text: "A heading", depth: 2 },
      { id: "note-a-heading-1", text: "A heading", depth: 2 },
      { id: "note-中文标题", text: "中文标题", depth: 3 },
    ]);
  });
  it("handles unusual or malformed frontmatter without losing the note", () => {
    expect(parseDocument("---\ntags: a,b 中文\ndescription: 7\n---\ntext", "a.md")).toMatchObject({
      title: "a",
      description: "",
      tags: ["a", "b", "中文"],
    });
    expect(parseDocument("---\n[a,b]\n---\ntext", "a.md").tags).toEqual([]);
    expect(parseDocument("---\nnull\n---\ntext", "a.md").markdown).toBe("text");
    expect(parseDocument("---\ntags: {a: b}\n---\ntext", "a.md").tags).toEqual([]);
    expect(parseDocument("---\nbroken: [\n---\n# Still here", "a.md").markdown).toContain(
      "broken: [",
    );
    expect(parseDocument("---\ntags: [a,b,c,d,e,f,g,h,i]\n---\n", "a.md").tags).toHaveLength(8);
    expect(parseDocument("", "Folder/empty.md").minutes).toBe(1);
    expect(parseDocument("word ".repeat(441), "a.md").minutes).toBe(3);
    expect(parseDocument("中".repeat(701), "a.md").minutes).toBe(3);
  });
  it("finds bounded unique embeds in prose, leaving code examples alone", () => {
    const parsed = parseDocument(
      "![[Note|alias]] ![[Note]]\n`![[Not an embed]]`\n\n```md\n![[Also code]]\n```\n" +
        Array.from({ length: 12 }, (_, index) => `![[${index}]]`).join(" "),
      "a.md",
    );
    expect(parsed.embeds).toHaveLength(8);
    expect(parsed.embeds[0]).toBe("Note");
    expect(parsed.embeds).not.toContain("Not an embed");
  });
  it("converts wikilinks, note embeds, callout titles and unknown callout labels", async () => {
    const processor = unified().use(remarkParse).use(remarkObsidian);
    const tree = await processor.run(
      processor.parse(
        "Before [[Folder/Note|Alias]] after ![[Image.png]]\n\n> [!TIP] Small step\n> Content\n\n> [!NOTE]\n> Hello\n\n> [!CUSTOM]\n> A custom note\n\n> Plain quote\n\n> **Strong quote**\n\n[Existing [[link]]](https://example.org)\n",
      ),
    );
    const value = JSON.stringify(tree);
    expect(value).toContain("ocelot-wiki:Folder%2FNote");
    expect(value).toContain("ocelot-embed:Image.png");
    expect(value).toContain('"dataCallout":"tip"');
    expect(value).toContain("Small step");
    expect(value).toContain("CUSTOM");
    expect(value).toContain("笔记");
    const noParent: Root = { type: "root", children: [] };
    remarkObsidian()(noParent);
    expect(noParent.children).toEqual([]);
  });
  it("sanitizes executable HTML before generating headings and block anchors", async () => {
    const html: HtmlRoot = {
      type: "root",
      children: [
        {
          type: "raw",
          value:
            '<h2 id="location"><em>Safe</em> heading</h2><h2>Safe heading</h2><script>alert(1)</script><iframe src="https://evil.test"></iframe><img src="https://tracker.test/pixel" onerror="alert(1)"><a href="javascript:alert(1)">bad</a><form><input name="location"></form><p>Kept paragraph ^reference</p><p><strong>Nested</strong></p><!-- comment -->',
        },
      ],
    };
    const result = await unified()
      .use(rehypeRaw)
      .use(rehypeSanitize, readingSchema)
      .use(rehypeReadingAnchors)
      .run(html);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('"tagName":"script"');
    expect(serialized).not.toContain('"tagName":"iframe"');
    expect(serialized).not.toContain('"onError"');
    expect(serialized).not.toContain('"src":"https://tracker.test/pixel"');
    expect(serialized).not.toContain('"href":"javascript:alert(1)"');
    expect(serialized).toContain('"id":"note-safe-heading"');
    expect(serialized).toContain('"id":"note-safe-heading-1"');
    expect(serialized).toContain('"id":"block-reference"');
    expect(serialized).not.toContain('"name":"location"');
  });
  it("extracts bounded, readable note sections for embeds", () => {
    const source =
      "# Note\n\nIntroduction\n\n## Part\n\nSelected paragraph.\n\n## Next\n\nOther paragraph.";
    expect(embedExcerpt(source, "a.md", "note-part")).toEqual({
      title: "Note",
      text: "Selected paragraph.",
    });
    expect(embedExcerpt(source, "a.md", "note-missing").text).toContain("Introduction");
    expect(embedExcerpt("# Title\n\n## Empty", "a.md", "note-empty").text).toBe("");
    expect(embedExcerpt(`# Note\n\n${"a".repeat(400)}`, "a.md", "").text).toHaveLength(361);
  });
});

describe("calm credential reminders", () => {
  const now = Date.parse("2026-09-11T00:00:00Z");
  const connection: Connection = { status: "healthy", expiresAt: null, checkedAt: now, retryAt: 0 };
  it("distinguishes failure, backoff, unavailable expiry and an upcoming rotation", () => {
    expect(connectionPresentation(null, now).tone).toBe("quiet");
    expect(connectionPresentation({ ...connection, status: "unknown" }, now).label).toBe(
      "等待连接",
    );
    expect(connectionPresentation({ ...connection, status: "invalid" }, now).label).toBe(
      "连接需要更新",
    );
    expect(connectionPresentation({ ...connection, status: "limited" }, now).tone).toBe("quiet");
    expect(connectionPresentation({ ...connection, status: "offline" }, now).label).toBe(
      "连接暂不可用",
    );
    expect(connectionPresentation(connection, now).detail).toContain("未提供有效期");
    expect(connectionPresentation({ ...connection, expiresAt: "2026-10-11" }, now).tone).toBe(
      "good",
    );
    expect(connectionPresentation({ ...connection, expiresAt: "2026-09-14" }, now).label).toBe(
      "3 天后需要轮换",
    );
    expect(connectionPresentation({ ...connection, expiresAt: "2026-09-10" }, now).label).toBe(
      "请确认凭据有效期",
    );
    expect(connectionPresentation(connection).label).toBe("GitHub 已连接");
  });
});
