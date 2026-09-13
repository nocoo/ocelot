import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockGitHub } from "../../mock/github";
import type { DocumentContent, Snapshot, VaultFile } from "../../src/models/contracts";
import { GitHub, type Transport } from "../../worker/github";
import { cleanup, connection, deleteCached, VaultStore } from "../../worker/store";

const makeStore = (transport: Transport = mockGitHub(env)) =>
  new VaultStore(env, new GitHub(env, transport));
const add = (store = makeStore()) => store.add("ocelot-demo/fieldnotes");
const setUpstream = (scenario: string) =>
  env.DB.prepare("UPDATE mock_state SET scenario = ?").bind(scenario).run();
const treeKey = (snapshot: Snapshot) =>
  `repos/${snapshot.repository.id}/trees/${snapshot.treeSha}.json`;
async function replaceFiles(snapshot: Snapshot, files: VaultFile[]) {
  await env.CACHE.put(treeKey(snapshot), JSON.stringify(files));
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}
afterEach(() => vi.restoreAllMocks());

describe("authorization before cache access", () => {
  it("denies already-cached private content as soon as a PAT failure is known", async () => {
    const transport = vi.fn(mockGitHub(env));
    const store = makeStore(transport);
    const snapshot = await add(store);
    await (await store.content(101, snapshot.treeSha, "README.md", false)).body?.cancel();
    await setUpstream("invalid");
    await expect(store.sync(101, true)).rejects.toMatchObject({ code: "github_invalid" });
    transport.mockClear();
    await expect(store.content(101, snapshot.treeSha, "README.md", false)).rejects.toMatchObject({
      code: "github_invalid",
    });
    expect(transport).not.toHaveBeenCalled();
    expect((await env.CACHE.list()).objects).toHaveLength(2);
  });
  it("permits a fresh authorization window but fails closed when offline after expiry", async () => {
    const store = makeStore();
    const snapshot = await add(store);
    await (await store.content(101, snapshot.treeSha, "README.md", false)).body?.cancel();
    await setUpstream("offline");
    expect((await store.content(101, snapshot.treeSha, "README.md", false)).status).toBe(200);
    await env.DB.prepare("UPDATE repositories SET authorized_at = 0").run();
    await expect(store.content(101, snapshot.treeSha, "README.md", false)).rejects.toMatchObject({
      code: "github_offline",
    });
    expect((await connection(env)).status).toBe("offline");
  });
  it("records repository-specific revocation and validates stable repository identity", async () => {
    const snapshot = await add();
    await env.DB.prepare("UPDATE repositories SET authorized_at = 0").run();
    const revoked = makeStore(async () => new Response(null, { status: 404 }));
    await expect(revoked.snapshot(101)).rejects.toMatchObject({ code: "github_permission" });
    expect((await revoked.repository(101)).authorization).toBe("denied");
    const replaced = makeStore(async () =>
      Response.json({
        id: 999,
        owner: { login: "other" },
        name: "other",
        default_branch: "main",
        private: true,
      }),
    );
    await expect(replaced.content(101, snapshot.treeSha, "README.md", false)).rejects.toMatchObject(
      { code: "github_permission" },
    );
  });
  it("refreshes repository privacy and canonical metadata before reading a stale authorization", async () => {
    const store = makeStore();
    await add(store);
    await env.DB.prepare(
      "UPDATE repositories SET owner = 'old-owner', private = 0, authorized_at = 0",
    ).run();
    const snapshot = await store.snapshot(101);
    expect(snapshot.repository).toMatchObject({
      owner: "ocelot-demo",
      private: true,
    });
    expect((await store.repository(101)).authorization).toBe("allowed");
  });
  it("does not allow arbitrary snapshots, blobs or hidden paths into the cache namespace", async () => {
    const store = makeStore();
    const snapshot = await add(store);
    for (const path of ["../README.md", ".obsidian/private.json", "folder//note.md", "a\0.md"])
      await expect(store.content(101, snapshot.treeSha, path, false)).rejects.toMatchObject({
        code: "path_invalid",
      });
    await expect(store.content(101, "not-a-tree", "README.md", false)).rejects.toMatchObject({
      code: "path_invalid",
    });
    await expect(store.snapshot(101, "not-a-tree")).rejects.toMatchObject({
      code: "snapshot_invalid",
    });
    await expect(store.snapshot(101, "f".repeat(40))).rejects.toMatchObject({
      code: "snapshot_expired",
    });
    await expect(store.content(999, snapshot.treeSha, "README.md", false)).rejects.toMatchObject({
      code: "repository_missing",
    });
    await expect(
      store.content(101, snapshot.treeSha, "not-in-snapshot.md", false),
    ).rejects.toMatchObject({ code: "file_missing" });
  });
  it("invalidates authorization for permission failures while rebuilding trees or fetching blobs", async () => {
    const store = makeStore();
    const snapshot = await add(store);
    await env.CACHE.delete(treeKey(snapshot));
    await expect(
      makeStore(async () => new Response(null, { status: 403 })).snapshot(101),
    ).rejects.toMatchObject({ code: "github_permission" });
    expect((await store.repository(101)).authorization).toBe("denied");
    await store.snapshot(101);
    await expect(
      makeStore(async () => new Response(null, { status: 404 })).content(
        101,
        snapshot.treeSha,
        "README.md",
        false,
      ),
    ).rejects.toMatchObject({ code: "github_permission" });
    expect((await store.repository(101)).authorization).toBe("denied");
  });
});

describe("immutable snapshots and source update coordination", () => {
  it("minimizes checks inside the freshness window and keeps old snapshots readable", async () => {
    const transport = vi.fn(mockGitHub(env));
    const store = makeStore(transport);
    const original = await add(store);
    transport.mockClear();
    const fast = await store.sync(101);
    expect(fast.treeSha).toBe(original.treeSha);
    expect(transport).not.toHaveBeenCalled();
    await setUpstream("updated");
    const updated = await store.sync(101, true);
    expect(updated.treeSha).not.toBe(original.treeSha);
    expect((await store.snapshot(101, original.treeSha)).treeSha).toBe(original.treeSha);
    const oldDocument = await (
      await store.content(101, original.treeSha, "README.md", false)
    ).json<DocumentContent>();
    const newDocument = await (
      await store.content(101, updated.treeSha, "README.md", false)
    ).json<DocumentContent>();
    expect(oldDocument.content).not.toContain("第二个 Git 版本");
    expect(newDocument.content).toContain("第二个 Git 版本");
    expect(oldDocument.treeSha).not.toBe(newDocument.treeSha);
  });
  it("rebuilds evicted directory caches from the registered immutable tree", async () => {
    const store = makeStore();
    const original = await add(store);
    await env.CACHE.delete(treeKey(original));
    const restored = await store.snapshot(101);
    expect(restored.files).toEqual(original.files);
    expect(
      (
        await env.DB.prepare("SELECT count FROM mock_requests WHERE kind = 'tree'").first<{
          count: number;
        }>()
      )?.count,
    ).toBe(2);
  });
  it("initializes a registered vault with no snapshot and rejects impossible 304s", async () => {
    const store = makeStore();
    await env.DB.prepare(
      "INSERT INTO repositories (id, owner, name, branch, private, added_at) VALUES (101, 'ocelot-demo', 'fieldnotes', 'main', 1, 1)",
    ).run();
    expect((await store.snapshot(101)).files.length).toBeGreaterThan(1000);
    await env.DB.prepare("UPDATE repositories SET commit_sha = NULL, tree_sha = NULL").run();
    await expect(store.sync(101, true)).rejects.toMatchObject({ code: "github_response" });
  });
  it("deduplicates registrations and validates repository input", async () => {
    const store = makeStore();
    await add(store);
    await add(store);
    expect(await store.repositories()).toHaveLength(1);
    await expect(store.add("not a GitHub URL")).rejects.toMatchObject({ code: "repository_url" });
    await expect(store.repository(999)).rejects.toMatchObject({ status: 404 });
  });
  it("supports public vaults and branch names containing slashes", async () => {
    const store = makeStore();
    expect(
      (await store.add("https://github.com/ocelot-demo/studio-notes")).repository.private,
    ).toBe(false);
    expect((await store.add("ocelot-demo/reading-room")).repository.branch).toBe("notes/2026");
    expect(await store.repositories()).toHaveLength(2);
  });
  it("takes one synchronization lease while another request is in flight", async () => {
    await add();
    const ready = deferred();
    const release = deferred();
    const upstream = mockGitHub(env);
    const slow = makeStore(async (request) => {
      if (request.url.includes("/commits/")) {
        ready.resolve();
        await release.promise;
      }
      return upstream(request);
    });
    const first = slow.sync(101, true);
    await ready.promise;
    await expect(makeStore().sync(101, true)).rejects.toMatchObject({ code: "sync_busy" });
    release.resolve();
    await first;
    expect(
      await env.DB.prepare("SELECT lease, lease_until FROM repositories WHERE id = 101").first(),
    ).toMatchObject({ lease: null, lease_until: 0 });
  });
  it("does not let an older request publish after losing its lease", async () => {
    const original = await add();
    await setUpstream("updated");
    const ready = deferred();
    const release = deferred();
    const upstream = mockGitHub(env);
    const oldStore = makeStore(async (request) => {
      if (request.url.includes("/commits/")) {
        ready.resolve();
        await release.promise;
      }
      return upstream(request);
    });
    const old = oldStore.sync(101, true);
    await ready.promise;
    await env.DB.prepare(
      "UPDATE repositories SET lease = 'newer-request', lease_until = ? WHERE id = 101",
    )
      .bind(Date.now() + 120_000)
      .run();
    release.resolve();
    await expect(old).rejects.toMatchObject({ code: "sync_superseded" });
    const row = await env.DB.prepare(
      "SELECT tree_sha, lease FROM repositories WHERE id = 101",
    ).first();
    expect(row).toMatchObject({ tree_sha: original.treeSha, lease: "newer-request" });
    expect(
      (await env.DB.prepare("SELECT COUNT(*) AS count FROM snapshots").first<{ count: number }>())
        ?.count,
    ).toBe(1);
  });
});

describe("attachments and cache lifecycle", () => {
  it("streams safe images through the protected API and reuses cached bytes", async () => {
    const store = makeStore();
    const snapshot = await add(store);
    const image = await store.content(101, snapshot.treeSha, "附件/blue-hour.png", true);
    expect(image.headers.get("Content-Type")).toBe("image/png");
    expect(image.headers.get("Cache-Control")).toBe("private, no-store");
    const bytes = new Uint8Array(await image.arrayBuffer());
    expect(Array.from(bytes.slice(0, 4))).toEqual([137, 80, 78, 71]);
    await (await store.content(101, snapshot.treeSha, "附件/blue-hour.png", true)).body?.cancel();
    expect(
      (
        await env.DB.prepare("SELECT count FROM mock_requests WHERE kind = 'blob'").first<{
          count: number;
        }>()
      )?.count,
    ).toBe(1);
  });
  it("does not serve arbitrary HTML/SVG or cross-use the document and attachment endpoints", async () => {
    const store = makeStore();
    const snapshot = await add(store);
    await expect(
      store.content(101, snapshot.treeSha, "附件/unsupported.svg", true),
    ).rejects.toMatchObject({ code: "file_unsupported" });
    await expect(store.content(101, snapshot.treeSha, "README.md", true)).rejects.toMatchObject({
      code: "file_unsupported",
    });
    await expect(
      store.content(101, snapshot.treeSha, "附件/blue-hour.png", false),
    ).rejects.toMatchObject({ code: "file_unsupported" });
  });
  it("rejects oversized entries and Git LFS pointers before caching them", async () => {
    const snapshot = await add();
    const file = snapshot.files.find((file) => file.path === "README.md");
    expect(file).toBeDefined();
    await replaceFiles(snapshot, [{ path: "too-big.md", sha: "a".repeat(40), size: 2_097_153 }]);
    await expect(
      makeStore().content(101, snapshot.treeSha, "too-big.md", false),
    ).rejects.toMatchObject({ status: 413 });
    await replaceFiles(snapshot, [{ path: "image.png", sha: "a".repeat(40), size: 100 }]);
    const lfs = makeStore(
      async () => new Response("version https://git-lfs.github.com/spec/v1\noid sha256:synthetic"),
    );
    await expect(lfs.content(101, snapshot.treeSha, "image.png", true)).rejects.toMatchObject({
      code: "git_lfs",
    });
    expect((await env.CACHE.list({ prefix: "repos/101/blobs/" })).objects).toHaveLength(0);
  });
  it("serves PDF downloads with safe Unicode filenames", async () => {
    const store = makeStore();
    const snapshot = await add(store);
    const path = "附件/report résumé.pdf";
    const sha = "f".repeat(40);
    await replaceFiles(snapshot, [{ path, sha, size: 8 }]);
    await env.CACHE.put(`repos/101/blobs/${sha}`, "%PDF-1.7");
    const response = await store.content(101, snapshot.treeSha, path, true);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe(
      "attachment; filename*=UTF-8''report%20r%C3%A9sum%C3%A9.pdf",
    );
    await response.body?.cancel();
  });
  it("reports storage failure without exposing upstream data", async () => {
    const store = makeStore();
    const snapshot = await add(store);
    const tree = await env.CACHE.get(treeKey(snapshot));
    vi.spyOn(env.CACHE, "get").mockResolvedValueOnce(tree).mockResolvedValue(null);
    await expect(store.content(101, snapshot.treeSha, "README.md", false)).rejects.toMatchObject({
      code: "cache_unavailable",
    });
  });
  it("removes registry rows, snapshots and only that repository's private cache", async () => {
    const store = makeStore();
    const snapshot = await add(store);
    await store.add("ocelot-demo/studio-notes");
    await (await store.content(101, snapshot.treeSha, "README.md", false)).body?.cancel();
    await store.remove(101);
    expect((await store.repositories()).map((repo) => repo.id)).toEqual([102]);
    expect((await env.CACHE.list({ prefix: "repos/101/" })).objects).toHaveLength(0);
    expect((await env.CACHE.list({ prefix: "repos/102/" })).objects).toHaveLength(1);
    expect(
      (
        await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM snapshots WHERE repository_id = 101",
        ).first<{ count: number }>()
      )?.count,
    ).toBe(0);
    await expect(store.content(101, snapshot.treeSha, "README.md", false)).rejects.toMatchObject({
      status: 404,
    });
  });
  it("cleans paginated R2 listings while respecting the retention cutoff", async () => {
    for (let offset = 0; offset <= 500; offset += 100)
      await Promise.all(
        Array.from({ length: Math.min(100, 501 - offset) }, (_, index) =>
          env.CACHE.put(`repos/999/blobs/${String(offset + index).padStart(4, "0")}`, "x"),
        ),
      );
    await deleteCached(env.CACHE, "repos/999/", Date.now() - 10_000);
    expect((await env.CACHE.list({ prefix: "repos/999/", limit: 1000 })).objects).toHaveLength(501);
    await deleteCached(env.CACHE, "repos/999/");
    expect((await env.CACHE.list()).objects).toHaveLength(0);
  });
  it("expires old snapshots while preserving the current registration and its ability to rebuild", async () => {
    const store = makeStore();
    const snapshot = await add(store);
    await env.DB.prepare("INSERT INTO snapshots VALUES (101, ?, ?, 0)")
      .bind("f".repeat(40), "a".repeat(40))
      .run();
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 31 * 86_400_000);
    await cleanup(env);
    vi.restoreAllMocks();
    expect((await env.CACHE.list()).objects).toHaveLength(0);
    expect(
      (await env.DB.prepare("SELECT tree_sha FROM snapshots").all<{ tree_sha: string }>()).results,
    ).toEqual([{ tree_sha: snapshot.treeSha }]);
    expect((await store.snapshot(101)).files.length).toBe(snapshot.files.length);
  });
  it("reports an uninitialized database instead of presenting a healthy connection", async () => {
    await env.DB.prepare("DELETE FROM connection").run();
    await expect(connection(env)).rejects.toMatchObject({ code: "database_setup" });
  });
});
