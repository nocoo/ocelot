import type { VaultFile } from "./contracts";

export function canonicalPath(path: string): string | null {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Control characters are forbidden at the repository path boundary.
  if (!path || path.length > 1024 || /[\\\u0000-\u001f\u007f]/u.test(path)) return null;
  const segments = path.split("/");
  return segments.some((segment) => !segment || segment.startsWith(".")) ? null : path;
}

export function parseRepository(input: string): { owner: string; name: string } | null {
  const match = input
    .trim()
    .match(
      /^(?:https:\/\/github\.com\/)?([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9_.-]{1,100})\/?$/u,
    );
  if (!match) return null;
  const name = match[2].replace(/\.git$/u, "");
  if (!name || name === "." || name === "..") return null;
  return { owner: match[1], name };
}

export function isMarkdown(path: string): boolean {
  return /\.(md|markdown)$/iu.test(path);
}

export function fileTitle(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1).replace(/\.(md|markdown)$/iu, "");
}

export function initialDocument(files: VaultFile[]): string | null {
  const notes = files.filter((file) => isMarkdown(file.path));
  return (
    notes.find((file) => /^(README|欢迎|开始阅读)\.md$/iu.test(file.path))?.path ??
    notes[0]?.path ??
    null
  );
}

export function changedFiles(
  before: VaultFile[],
  after: VaultFile[],
): Record<string, "added" | "modified" | "deleted"> {
  const previous = new Map(before.map((file) => [file.path, file.sha]));
  const changes: Record<string, "added" | "modified" | "deleted"> = {};
  for (const file of after) {
    const sha = previous.get(file.path);
    if (sha !== file.sha) changes[file.path] = sha ? "modified" : "added";
    previous.delete(file.path);
  }
  for (const path of previous.keys()) changes[path] = "deleted";
  return changes;
}

export function searchFiles(files: VaultFile[], query: string): VaultFile[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/u);
  return files
    .filter(
      (file) =>
        isMarkdown(file.path) &&
        words.every((word) => file.path.toLocaleLowerCase().includes(word)),
    )
    .slice(0, 100);
}

export const attachmentTypes: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  pdf: "application/pdf",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  webm: "video/webm",
};

export function attachmentType(path: string): string | null {
  return attachmentTypes[path.split(".").at(-1)?.toLowerCase() ?? ""] ?? null;
}

export function contentUrl(
  repositoryId: number,
  treeSha: string,
  path: string,
  attachment = false,
): string {
  const params = new URLSearchParams({ tree: treeSha, path });
  return `/api/repositories/${repositoryId}/${attachment ? "asset" : "document"}?${params}`;
}
