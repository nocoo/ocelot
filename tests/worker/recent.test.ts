import { applyD1Migrations, reset } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import data from "../../fixtures/generated/github.json";
import { mockGitHub } from "../../mock/github";
import type { RecentPage, Snapshot, VaultFile } from "../../src/models/contracts";
import { GitHub, type Transport } from "../../worker/github";
import local from "../../worker/local";
import { cleanup, connection, deleteCached, VaultStore } from "../../worker/store";

const sha = (letter: string) => letter.repeat(40);
const file = (path: string): VaultFile => ({ path, sha: sha("a"), size: 30 });
const date = (day: number) => new Date(Date.UTC(2026, 8, day)).toISOString();
const create = (transport: Transport = mockGitHub(env)) => {
  const github = new GitHub(env, transport);
  return { github, store: new VaultStore(env, github) };
};
async function complete(store: VaultStore, snapshot: Snapshot) {
  let cursor = 0;
  while (true) {
    const page = await store.recent(snapshot.repository.id, snapshot.commitSha, cursor);
    if (page.next === null) return page;
    cursor = page.next;
  }
}
async function api(path: string, method = "GET") {
  return local.fetch(
    new Request(`http://127.0.0.1${path}`, {
      method,
      headers: { "X-Ocelot-Request": "1" },
    }),
    env,
  );
}
afterEach(() => vi.restoreAllMocks());

describe("recent updates with real D1, R2 and GitHub query transport", () => {
  it("upgrades existing snapshots and a recurring current tree without losing either commit", async () => {
    await reset();
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS.slice(0, 1));
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO repositories (id, owner, name, branch, private, added_at, commit_sha, tree_sha, checked_at) VALUES (102, 'ocelot-demo', 'studio-notes', 'main', 0, 1, ?, ?, 20)",
      ).bind(sha("b"), sha("c")),
      env.DB.prepare("INSERT INTO snapshots VALUES (102, ?, ?, 10)").bind(sha("c"), sha("a")),
      env.DB.prepare("INSERT INTO snapshots VALUES (102, ?, ?, 5)").bind(sha("e"), sha("d")),
    ]);
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
    expect(
      (await env.DB.prepare("SELECT * FROM revisions ORDER BY commit_sha").all()).results,
    ).toEqual([
      { repository_id: 102, commit_sha: sha("a"), tree_sha: sha("c"), created_at: 10 },
      { repository_id: 102, commit_sha: sha("b"), tree_sha: sha("c"), created_at: 20 },
      { repository_id: 102, commit_sha: sha("d"), tree_sha: sha("e"), created_at: 5 },
    ]);
    expect((await env.DB.prepare("SELECT * FROM snapshots").all()).results).toHaveLength(2);
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
    expect((await env.DB.prepare("SELECT * FROM revisions").all()).results).toHaveLength(3);
  });
  it("ranks the entire large vault, resumes cached batches and survives new Worker instances and evictions", async () => {
    const { store } = create();
    const snapshot = await store.add("ocelot-demo/fieldnotes");
    const partial = await store.recent(101, snapshot.commitSha);
    expect(partial.next).toBe(100);
    expect(await store.recent(101, snapshot.commitSha)).toEqual(partial);
    const result = await complete(new VaultStore(env, new GitHub(env, mockGitHub(env))), snapshot);
    expect(result.next).toBeNull();
    expect(result.items).toHaveLength(50);
    const history = data.repositories[0].revisions[0].history as Record<string, string>;
    const expected = Object.entries(history)
      .filter(([path]) => path.startsWith("05 长期档案/"))
      .sort(([a, at], [b, bt]) => bt.localeCompare(at) || (a < b ? -1 : 1))
      .slice(0, 50)
      .map(([path, updatedAt]) => ({ path, updatedAt }));
    expect(result.items).toEqual(expected);
    expect(
      (
        await env.DB.prepare("SELECT count FROM mock_requests WHERE kind = 'history'").first<{
          count: number;
        }>()
      )?.count,
    ).toBe(12);
    expect(
      await env.DB.prepare("SELECT count FROM mock_requests WHERE kind = 'blob'").first(),
    ).toBeNull();
    expect(await create().store.recent(101, snapshot.commitSha)).toEqual(result);
    await deleteCached(env.CACHE, `repos/101/recent/`);
    await env.CACHE.delete(`repos/101/trees/${snapshot.treeSha}.json`);
    expect(await complete(create().store, snapshot)).toEqual(result);
    expect(
      (
        await env.DB.prepare("SELECT count FROM mock_requests WHERE kind = 'history'").first<{
          count: number;
        }>()
      )?.count,
    ).toBe(24);
  });
  it("returns fewer than 50, stable ties and an empty collection without fabricating dates", async () => {
    const { store, github } = create();
    const snapshot = await store.add("ocelot-demo/studio-notes");
    expect((await store.recent(102, snapshot.commitSha)).items).toEqual([
      { path: "Systems/Color and contrast.md", updatedAt: "2025-01-01T00:00:00.000Z" },
      { path: "Typography/Reading rhythm.md", updatedAt: "2025-01-01T00:00:00.000Z" },
    ]);
    await deleteCached(env.CACHE, "repos/102/recent/");
    await env.CACHE.put(
      `repos/102/trees/${snapshot.treeSha}.json`,
      JSON.stringify([file("README.md"), file(".trash/old.md"), file("picture.png")]),
    );
    const readDates = vi.spyOn(github, "updatedNotes");
    expect(await store.recent(102, snapshot.commitSha)).toEqual({
      commitSha: snapshot.commitSha,
      items: [],
      next: null,
    });
    expect(readDates).not.toHaveBeenCalled();
  });
  it("handles renames, deletions, same-time commits and a reverted tree without mixing histories", async () => {
    const { store, github } = create();
    const original = await store.add("ocelot-demo/studio-notes");
    const before = [file("old.md"), file("deleted.md"), file("steady.md")];
    const after = [file("renamed.md"), file("steady.md")];
    const newer = { ...original, commitSha: sha("b"), treeSha: sha("c"), files: after };
    await env.CACHE.put(`repos/102/trees/${original.treeSha}.json`, JSON.stringify(before));
    await env.CACHE.put(`repos/102/trees/${newer.treeSha}.json`, JSON.stringify(after));
    await env.DB.prepare("INSERT INTO revisions VALUES (102, ?, ?, ?)")
      .bind(newer.commitSha, newer.treeSha, Date.now())
      .run();
    vi.spyOn(github, "updatedNotes").mockImplementation(async (_repository, commit, files) =>
      files.map((entry) => ({
        path: entry.path,
        updatedAt: commit === original.commitSha ? date(1) : date(2),
      })),
    );
    const oldList = await store.recent(102, original.commitSha);
    expect(oldList.items.map((note) => note.path)).toEqual(["deleted.md", "old.md", "steady.md"]);
    const newList = await store.recent(102, newer.commitSha);
    expect(newList.items).toEqual([
      { path: "renamed.md", updatedAt: date(2) },
      { path: "steady.md", updatedAt: date(2) },
    ]);
    expect(await store.recent(102, original.commitSha)).toEqual(oldList);
    await env.DB.prepare("INSERT INTO revisions VALUES (102, ?, ?, ?)")
      .bind(sha("d"), original.treeSha, Date.now())
      .run();
    const reverted = await store.recent(102, sha("d"));
    expect(reverted.items.map((note) => note.path)).toEqual(oldList.items.map((note) => note.path));
    expect(reverted.items.every((note) => note.updatedAt === date(2))).toBe(true);
    expect(github.updatedNotes).toHaveBeenCalledTimes(3);
  });
  it("never treats the first 50 candidates as the final list and can retry an interrupted batch", async () => {
    const { store, github } = create();
    const snapshot = await store.add("ocelot-demo/studio-notes");
    const files = Array.from({ length: 105 }, (_, index) =>
      file(`Note-${String(index).padStart(3, "0")}.md`),
    );
    await env.CACHE.put(`repos/102/trees/${snapshot.treeSha}.json`, JSON.stringify(files));
    const history = vi
      .spyOn(github, "updatedNotes")
      .mockImplementation(async (_repository, _commit, batch) =>
        batch.map((entry) => ({
          path: entry.path,
          updatedAt: entry.path === "Note-104.md" ? date(9) : date(1),
        })),
      );
    expect((await store.recent(102, snapshot.commitSha)).next).toBe(100);
    history.mockRejectedValueOnce(new Error("Synthetic interruption"));
    await expect(store.recent(102, snapshot.commitSha, 100)).rejects.toThrow(
      "Synthetic interruption",
    );
    const result = await store.recent(102, snapshot.commitSha, 100);
    expect(result.items[0]).toEqual({ path: "Note-104.md", updatedAt: date(9) });
    expect(result.items).toHaveLength(50);
    expect(result.items.at(-1)?.path).toBe("Note-048.md");
  });
  it("validates revision and continuation boundaries, and authorizes before any cached response", async () => {
    const { store } = create();
    const snapshot = await store.add("ocelot-demo/fieldnotes");
    for (const cursor of [-1, 1, 1.5, 20_100, Number.NaN])
      await expect(store.recent(101, snapshot.commitSha, cursor)).rejects.toMatchObject({
        code: "recent_invalid",
      });
    await expect(store.recent(101, "bad")).rejects.toMatchObject({ code: "recent_invalid" });
    await expect(store.recent(101, sha("f"))).rejects.toMatchObject({ code: "snapshot_expired" });
    await expect(store.recent(101, snapshot.commitSha, 1200)).rejects.toMatchObject({
      code: "recent_invalid",
    });
    await expect(store.recent(101, snapshot.commitSha, 100)).rejects.toMatchObject({
      code: "recent_restart",
    });
    await store.recent(101, snapshot.commitSha);
    const cache = vi.spyOn(env.CACHE, "get");
    await env.DB.prepare("UPDATE connection SET status = 'invalid'").run();
    await expect(store.recent(101, snapshot.commitSha)).rejects.toMatchObject({
      code: "github_invalid",
    });
    expect(cache).not.toHaveBeenCalled();
    await env.DB.prepare("UPDATE connection SET status = 'healthy'").run();
    await env.DB.prepare("UPDATE repositories SET authorized_at = 0").run();
    await env.DB.prepare("UPDATE mock_state SET scenario = 'offline'").run();
    await expect(store.recent(101, snapshot.commitSha)).rejects.toMatchObject({
      code: "github_offline",
    });
    expect(cache).not.toHaveBeenCalled();
  });
  it("exposes authenticated no-store HTTP pages, tracks commit-only syncs and cascades removal", async () => {
    const { store, github } = create();
    const snapshot = await store.add("ocelot-demo/studio-notes");
    const response = await api(`/api/repositories/102/recent?commit=${snapshot.commitSha}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await response.json<RecentPage>()).items).toHaveLength(2);
    expect(
      (await api(`/api/repositories/102/recent?commit=${snapshot.commitSha}&cursor=bad`)).status,
    ).toBe(400);
    const newer = sha("e");
    vi.spyOn(github, "head").mockResolvedValue({
      sha: newer,
      tree: snapshot.treeSha,
      etag: '"new"',
    });
    await store.sync(102, true);
    const synced = await api(
      `/api/repositories/102/sync?known=${snapshot.treeSha}&knownCommit=${snapshot.commitSha}`,
      "POST",
    );
    expect((await synced.json<Snapshot>()).commitSha).toBe(newer);
    expect(
      await (
        await api(
          `/api/repositories/102/sync?known=${snapshot.treeSha}&knownCommit=${newer}`,
          "POST",
        )
      ).json(),
    ).toMatchObject({ unchanged: true });
    await env.DB.prepare("UPDATE revisions SET created_at = 0").run();
    await cleanup(env);
    expect((await env.DB.prepare("SELECT commit_sha FROM revisions").all()).results).toEqual([
      { commit_sha: newer },
    ]);
    await store.remove(102);
    expect((await env.DB.prepare("SELECT * FROM revisions").all()).results).toEqual([]);
    expect((await env.CACHE.list({ prefix: "repos/102/" })).objects).toEqual([]);
    expect((await api(`/api/repositories/102/recent?commit=${newer}`)).status).toBe(404);
  });
});

describe("GitHub commit dates boundary", () => {
  it("uses a read-only query pinned to a commit with escaped paths and canonical UTC committer time", async () => {
    const { store } = create();
    const snapshot = await store.add("ocelot-demo/studio-notes");
    const transport = vi.fn<Transport>().mockResolvedValue(
      Response.json({
        data: {
          repository: {
            databaseId: 102,
            object: {
              oid: snapshot.commitSha,
              p0: { nodes: [{ committedDate: "2026-09-12T09:00:00+08:00" }] },
            },
          },
        },
      }),
    );
    const path = '中文/"quoted" note.md';
    const github = new GitHub(env, transport);
    expect(
      await github.updatedNotes(snapshot.repository, snapshot.commitSha, [file(path)]),
    ).toEqual([{ path, updatedAt: "2026-09-12T01:00:00.000Z" }]);
    const request = transport.mock.calls[0][0];
    expect(request.url).toBe("https://api.github.com/graphql");
    expect(request.method).toBe("POST");
    const body = await request.json<{ query: string; variables: Record<string, string> }>();
    expect(body.query).toMatch(/^query\(/u);
    expect(body.query).not.toContain("mutation");
    expect(body.query).toContain(JSON.stringify(path));
    expect(body.query).toContain("committedDate");
    expect(body.variables).toEqual({
      owner: "ocelot-demo",
      name: "studio-notes",
      commit: snapshot.commitSha,
    });
  });
  it("rejects unknown commits, unknown repositories and missing path histories in the synthetic transport", async () => {
    const { store, github } = create();
    const snapshot = await store.add("ocelot-demo/studio-notes");
    await expect(
      github.updatedNotes(snapshot.repository, sha("f"), [file("README.md")]),
    ).rejects.toMatchObject({ code: "github_response" });
    await expect(
      github.updatedNotes({ ...snapshot.repository, name: "unknown" }, snapshot.commitSha, [
        file("README.md"),
      ]),
    ).rejects.toMatchObject({ code: "github_permission" });
    await expect(
      github.updatedNotes(snapshot.repository, snapshot.commitSha, [file("unknown.md")]),
    ).rejects.toMatchObject({ code: "github_response" });
  });
  it.each([
    {},
    { data: { repository: { databaseId: 999, object: { oid: sha("a") } } } },
    { data: { repository: { databaseId: 102, object: { oid: sha("a"), p0: { nodes: [] } } } } },
    { data: { repository: { databaseId: 102, object: { oid: sha("a"), p0: { nodes: [{}] } } } } },
    {
      data: {
        repository: {
          databaseId: 102,
          object: { oid: sha("a"), p0: { nodes: [{ committedDate: "invalid" }] } },
        },
      },
    },
    { errors: [{ type: "SOMETHING_ELSE", message: "Private upstream details" }] },
    { errors: [{}] },
  ])("fails closed on incomplete GraphQL data: %j", async (body) => {
    const snapshot = await create().store.add("ocelot-demo/studio-notes");
    const github = new GitHub(env, async () => Response.json(body));
    await expect(
      github.updatedNotes(snapshot.repository, sha("a"), [file("note.md")]),
    ).rejects.toThrow(/请/u);
  });
  it("records rate limits and repository revocation without returning cached partial rankings", async () => {
    const { store, github } = create();
    const snapshot = await store.add("ocelot-demo/fieldnotes");
    await store.recent(101, snapshot.commitSha);
    vi.spyOn(github, "request").mockResolvedValueOnce(
      Response.json({ errors: [{ type: "FORBIDDEN" }] }),
    );
    await expect(store.recent(101, snapshot.commitSha, 100)).rejects.toMatchObject({
      code: "github_permission",
    });
    expect((await store.repository(101)).authorization).toBe("denied");
    const limited = new GitHub(env, async () =>
      Response.json({ errors: [{ type: "RATE_LIMITED" }] }, { headers: { "Retry-After": "30" } }),
    );
    await expect(
      limited.updatedNotes(snapshot.repository, snapshot.commitSha, [file("note.md")]),
    ).rejects.toMatchObject({ code: "github_limited" });
    expect((await connection(env)).status).toBe("limited");
    expect((await connection(env)).retryAt).toBeGreaterThan(Date.now());
  });
});
