import type { Snapshot, VaultFile } from "./contracts";
import { attachmentType, canonicalPath, contentUrl, fileTitle, isMarkdown } from "./vault";

export interface VaultLink {
  kind: "note" | "asset" | "external" | "missing";
  path: string;
  anchor: string;
}

export function headingSlug(text: string): string {
  return text
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .replace(/\s+/gu, "-");
}

export function anchorId(text: string): string {
  return text.startsWith("^") ? `block-${headingSlug(text.slice(1))}` : `note-${headingSlug(text)}`;
}

function relativePath(target: string, current: string): string | null {
  const segments = target.startsWith("/") ? [] : current.split("/").slice(0, -1);
  for (const segment of target.replace(/^\//u, "").split("/")) {
    if (segment === ".") continue;
    if (segment === "..") {
      if (!segments.length) return null;
      segments.pop();
    } else segments.push(segment);
  }
  return canonicalPath(segments.join("/"));
}

export function resolveLink(
  href: string,
  current: string,
  files: VaultFile[],
  wiki = false,
): VaultLink {
  const missing: VaultLink = { kind: "missing", path: "", anchor: "" };
  let value: string;
  try {
    value = decodeURIComponent(href).trim();
  } catch {
    return missing;
  }
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Reject control characters in untrusted Markdown destinations.
  if (!value || /[\u0000-\u001f\u007f\\]/u.test(value)) return missing;
  if (/^(https?:\/\/|mailto:)/iu.test(value) && !wiki)
    return { kind: "external", path: value, anchor: "" };
  if (/^[a-z][a-z\d+.-]*:/iu.test(value) || value.startsWith("//")) return missing;
  const separator = value.indexOf("#");
  const target = separator < 0 ? value : value.slice(0, separator);
  const anchor = separator < 0 ? "" : anchorId(value.slice(separator + 1));
  if (!target) return { kind: "note", path: current, anchor };
  const relative = relativePath(target, current);
  if (!relative) return missing;
  const candidates = [relative, `${relative}.md`, `${relative}.markdown`];
  if (wiki && canonicalPath(target)) candidates.push(target, `${target}.md`, `${target}.markdown`);
  let file = candidates.map((path) => files.find((item) => item.path === path)).find(Boolean);
  if (!file && wiki && !target.includes("/")) {
    const matches = files.filter(
      (item) => fileTitle(item.path).toLocaleLowerCase() === fileTitle(target).toLocaleLowerCase(),
    );
    if (matches.length === 1) file = matches[0];
  }
  if (!file) return missing;
  if (isMarkdown(file.path)) return { kind: "note", path: file.path, anchor };
  return attachmentType(file.path) ? { kind: "asset", path: file.path, anchor: "" } : missing;
}

export function routeUrl(repository: number, path: string, anchor = ""): string {
  return `/?${new URLSearchParams({ repo: String(repository), note: path })}${anchor ? `#${encodeURIComponent(anchor)}` : ""}`;
}

export function renderUrl(
  value: string,
  image: boolean,
  current: string,
  snapshot: Snapshot,
): string {
  const wiki = value.startsWith("ocelot-wiki:") || value.startsWith("ocelot-embed:");
  const link = resolveLink(
    wiki ? value.slice(value.indexOf(":") + 1) : value,
    current,
    snapshot.files,
    wiki,
  );
  if (link.kind === "note") return routeUrl(snapshot.repository.id, link.path, link.anchor);
  if (link.kind === "asset")
    return contentUrl(snapshot.repository.id, snapshot.treeSha, link.path, true);
  if (link.kind === "external" && !image) return link.path;
  return "";
}
