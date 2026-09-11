import type { Element, Root as HtmlRoot } from "hast";
import type { Image, Link, Paragraph, PhrasingContent, Root } from "mdast";
import { toString as plainText } from "mdast-util-to-string";
import { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { parse as parseYaml } from "yaml";
import { anchorId, headingSlug } from "./links";
import { fileTitle } from "./vault";

export interface Heading {
  id: string;
  text: string;
  depth: number;
}
export interface ParsedDocument {
  title: string;
  description: string;
  tags: string[];
  markdown: string;
  headings: Heading[];
  minutes: number;
  embeds: string[];
}

export function parseDocument(source: string, path: string): ParsedDocument {
  let markdown = source.replace(/^\uFEFF/u, "").replace(/\r\n/gu, "\n");
  let metadata: Record<string, unknown> = {};
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---(?:\n|$)/u);
  if (frontmatter) {
    try {
      const parsed: unknown = parseYaml(frontmatter[1], { maxAliasCount: 20 });
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        metadata = parsed as Record<string, unknown>;
      markdown = markdown.slice(frontmatter[0].length);
    } catch {
      /* Keep malformed frontmatter visible instead of silently losing text. */
    }
  }
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  const firstHeading = tree.children.find((node) => node.type === "heading" && node.depth === 1);
  const title = firstHeading ? plainText(firstHeading) : fileTitle(path);
  if (firstHeading?.position)
    markdown =
      markdown.slice(0, firstHeading.position.start.offset) +
      markdown.slice(firstHeading.position.end.offset);
  const headings: Heading[] = [];
  const seen = new Map<string, number>();
  visit(tree, "heading", (node) => {
    if (node === firstHeading) return;
    const text = plainText(node);
    const slug = headingSlug(text);
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    headings.push({ text, depth: node.depth, id: `note-${slug}${count ? `-${count}` : ""}` });
  });
  const embeds: string[] = [];
  visit(tree, "text", (node) => {
    for (const match of node.value.matchAll(/!\[\[([^\]\n]+)\]\]/gu))
      embeds.push(match[1].split("|")[0]);
  });
  const text = plainText(tree);
  const chinese = text.match(/\p{Script=Han}/gu)?.length ?? 0;
  const words = text.replace(/\p{Script=Han}/gu, " ").match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  const tags = Array.isArray(metadata.tags)
    ? metadata.tags
    : typeof metadata.tags === "string"
      ? metadata.tags.split(/[,，\s]+/u)
      : [];
  return {
    title,
    description: typeof metadata.description === "string" ? metadata.description : "",
    tags: tags.filter((tag): tag is string => typeof tag === "string").slice(0, 8),
    markdown: markdown.trim(),
    headings,
    minutes: Math.max(1, Math.ceil(chinese / 350 + words / 220)),
    embeds: [...new Set(embeds)].slice(0, 8),
  };
}

export function remarkObsidian() {
  return (tree: Root) => {
    visit(tree, "text", (node, index, parent) => {
      if (!parent || index === undefined || parent.type === "link") return;
      const pieces: PhrasingContent[] = [];
      let offset = 0;
      for (const match of node.value.matchAll(/(!)?\[\[([^\]\n]+)\]\]/gu)) {
        pieces.push({ type: "text", value: node.value.slice(offset, match.index) });
        const [target, alias] = match[2].split("|");
        const label = alias || target.split("/").at(-1) || target;
        const replacement: Image | Link = match[1]
          ? {
              type: "image",
              url: `ocelot-embed:${encodeURIComponent(target)}`,
              alt: label,
              data: { hProperties: { dataEmbed: target } },
            }
          : {
              type: "link",
              url: `ocelot-wiki:${encodeURIComponent(target)}`,
              children: [{ type: "text", value: label }],
            };
        pieces.push(replacement);
        if (match[1] && parent.type === "paragraph") parent.data = { ...parent.data, hName: "div" };
        offset = match.index + match[0].length;
      }
      if (!offset) return;
      pieces.push({ type: "text", value: node.value.slice(offset) });
      parent.children.splice(index, 1, ...pieces);
      return index + pieces.length;
    });
    visit(tree, "blockquote", (node) => {
      const first = node.children[0];
      const text = first?.type === "paragraph" ? first.children[0] : undefined;
      if (text?.type !== "text") return;
      const match = text.value.match(/^\[!([a-z]+)\][+-]?(?:[ \t]+([^\n]*))?(?:\n|$)/iu);
      if (!match) return;
      const type = match[1].toLowerCase();
      const labels: Record<string, string> = {
        note: "笔记",
        tip: "提示",
        warning: "留意",
        danger: "注意",
        info: "信息",
        quote: "摘录",
        example: "例子",
        abstract: "摘要",
        success: "完成",
        question: "问题",
        failure: "提醒",
        bug: "问题",
      };
      const title: Paragraph = {
        type: "paragraph",
        data: { hProperties: { className: ["callout-title"] } },
        children: [
          {
            type: "strong",
            children: [{ type: "text", value: match[2] || labels[type] || match[1] }],
          },
        ],
      };
      text.value = text.value.slice(match[0].length);
      node.data = { hName: "aside", hProperties: { dataCallout: type } };
      node.children.unshift(title);
    });
  };
}

function elementText(element: Element): string {
  return element.children
    .map((node) =>
      node.type === "text" ? node.value : node.type === "element" ? elementText(node) : "",
    )
    .join("");
}

export function rehypeReadingAnchors() {
  return (tree: HtmlRoot) => {
    const seen = new Map<string, number>();
    visit(tree, "element", (node) => {
      if (/^h[1-6]$/u.test(node.tagName)) {
        const slug = headingSlug(elementText(node));
        const count = seen.get(slug) ?? 0;
        seen.set(slug, count + 1);
        node.properties.id = `note-${slug}${count ? `-${count}` : ""}`;
      }
      if (node.tagName === "p") {
        const last = node.children.at(-1);
        const match = last?.type === "text" && last.value.match(/\s+\^([a-z\d-]+)\s*$/iu);
        if (match && last?.type === "text") {
          node.properties.id = anchorId(`^${match[1]}`);
          last.value = last.value.slice(0, match.index);
        }
      }
    });
  };
}

export const readingSchema: typeof defaultSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "aside"],
  attributes: {
    ...defaultSchema.attributes,
    "*": (defaultSchema.attributes?.["*"] ?? []).filter(
      (attribute) => attribute !== "id" && attribute !== "name",
    ),
    aside: ["dataCallout"],
    p: [["className", "callout-title"]],
    img: [...(defaultSchema.attributes?.img ?? []), "dataEmbed"],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto", "ocelot-wiki"],
    src: ["ocelot-embed"],
  },
};

export function embedExcerpt(
  source: string,
  path: string,
  anchor: string,
): { title: string; text: string } {
  const parsed = parseDocument(source, path);
  let markdown = parsed.markdown;
  if (anchor) {
    const tree = unified().use(remarkParse).parse(markdown);
    const index = tree.children.findIndex(
      (node) => node.type === "heading" && anchorId(plainText(node)) === anchor,
    );
    if (index >= 0) {
      const start = tree.children[index + 1]?.position?.start.offset ?? markdown.length;
      const next = tree.children.slice(index + 1).find((node) => node.type === "heading");
      markdown = markdown.slice(start, next?.position?.start.offset);
    }
  }
  const plain = plainText(unified().use(remarkParse).parse(markdown)).replace(/\^\w+/gu, "").trim();
  return { title: parsed.title, text: plain.length > 360 ? `${plain.slice(0, 360)}…` : plain };
}
