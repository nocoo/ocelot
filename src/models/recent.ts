import type { RecentNote, VaultFile } from "./contracts";
import { canonicalPath, isMarkdown } from "./vault";

export function isHomeDocument(path: string): boolean {
  return /^README\.(md|markdown)$/iu.test(path);
}

function comparePaths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function recentCandidates(files: VaultFile[]): VaultFile[] {
  return files
    .filter(
      (file) =>
        canonicalPath(file.path) &&
        isMarkdown(file.path) &&
        file.size <= 2_097_152 &&
        !/^(README|AGENTS|CLAUDE|CHANGELOG|LICENSE|CONTRIBUTING|CODE_OF_CONDUCT|SECURITY)\.(md|markdown)$/iu.test(
          file.path,
        ),
    )
    .sort((a, b) => comparePaths(a.path, b.path));
}

export function latestNotes(notes: RecentNote[]): RecentNote[] {
  return [...notes]
    .sort(
      (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || comparePaths(a.path, b.path),
    )
    .slice(0, 50);
}
