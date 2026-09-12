import { describe, expect, it } from "vitest";
import { isHomeDocument, latestNotes, recentCandidates } from "../../src/models/recent";

const file = (path: string, size = 20) => ({ path, size, sha: "a".repeat(40) });
const date = (day: number) => new Date(Date.UTC(2026, 0, day)).toISOString();

describe("recent article policy", () => {
  it("excludes hidden, non-article, unsupported and oversized paths without excluding ordinary nested notes", () => {
    const input = [
      file("README.md"),
      file("readme.MARKDOWN"),
      file("AGENTS.md"),
      file("CLAUDE.md"),
      file("CHANGELOG.md"),
      file("LICENSE.md"),
      file("SECURITY.md"),
      file("CONTRIBUTING.md"),
      file("CODE_OF_CONDUCT.md"),
      file("picture.png"),
      file("a/.trash/deleted.md"),
      file(".obsidian/hidden.md"),
      file("../outside.md"),
      file("a\\bad.md"),
      file("huge.md", 2_097_153),
      file("中文/README.md"),
      file("b.MARKDOWN"),
      file("A.MD", 2_097_152),
      file("空 格.md"),
    ];
    expect(recentCandidates(input).map((entry) => entry.path)).toEqual([
      "A.MD",
      "b.MARKDOWN",
      "中文/README.md",
      "空 格.md",
    ]);
    expect(input[0].path).toBe("README.md");
    expect(isHomeDocument("README.md")).toBe(true);
    expect(isHomeDocument("readme.MARKDOWN")).toBe(true);
    expect(isHomeDocument("folder/README.md")).toBe(false);
    expect(isHomeDocument("Other.md")).toBe(false);
    expect(recentCandidates([file("same.md"), file("same.md")])).toHaveLength(2);
  });
  it("sorts by source time, then ordinal full path, caps at 50 and never mutates input", () => {
    const tied = ["中文.md", "b.md", "A.md", "a.md"].map((path) => ({ path, updatedAt: date(2) }));
    const notes = [
      { path: "old.md", updatedAt: date(1) },
      ...tied,
      { path: "new.md", updatedAt: date(3) },
    ];
    expect(latestNotes(notes).map((note) => note.path)).toEqual([
      "new.md",
      "A.md",
      "a.md",
      "b.md",
      "中文.md",
      "old.md",
    ]);
    expect(notes[0].path).toBe("old.md");
    const many = Array.from({ length: 75 }, (_, index) => ({
      path: `note-${index}.md`,
      updatedAt: date(index + 1),
    }));
    expect(latestNotes(many)).toHaveLength(50);
    expect(latestNotes(many)[0].path).toBe("note-74.md");
    expect(latestNotes(many).at(-1)?.path).toBe("note-25.md");
    expect(latestNotes([])).toEqual([]);
    expect(latestNotes([tied[0], tied[0]])).toEqual([tied[0], tied[0]]);
  });
});
