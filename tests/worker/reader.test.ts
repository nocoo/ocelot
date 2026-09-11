import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { mockGitHub } from "../../mock/github";
import type { DocumentContent, Snapshot } from "../../src/models/contracts";
import local from "../../worker/local";

async function api(path: string, method = "GET", body?: unknown): Promise<Response> {
  return local.fetch(
    new Request(`http://127.0.0.1${path}`, {
      method,
      headers: { "X-Ocelot-Request": "1", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
}

describe("local reader with real D1 and R2", () => {
  it("serves synthetic repository metadata", async () => {
    const response = await mockGitHub(env)(
      new Request("https://api.github.com/repos/ocelot-demo/fieldnotes", {
        headers: { Authorization: "Bearer synthetic-local-credential" },
        redirect: "manual",
        signal: AbortSignal.timeout(12_000),
      }),
    );
    expect(response.status).toBe(200);
  });
  it("adds a private vault, caches only opened content, and reuses an unchanged tree", async () => {
    const added = await api("/api/repositories", "POST", { repository: "ocelot-demo/fieldnotes" });
    expect(added.status, await added.clone().text()).toBe(201);
    const snapshot = await added.json<Snapshot>();
    expect(snapshot.files.length).toBeGreaterThan(1100);
    expect(snapshot.files.some((file) => file.path.startsWith("."))).toBe(false);
    expect(snapshot.repository.private).toBe(true);
    const objects = await env.CACHE.list();
    expect(objects.objects).toHaveLength(1);
    const path = `/api/repositories/101/document?${new URLSearchParams({ tree: snapshot.treeSha, path: "README.md" })}`;
    const first = await api(path);
    expect(first.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await first.json<DocumentContent>()).content).toContain("安静的探索");
    await (await api(path)).body?.cancel();
    expect(
      (
        await env.DB.prepare("SELECT count FROM mock_requests WHERE kind = 'blob'").first<{
          count: number;
        }>()
      )?.count,
    ).toBe(1);
    const synced = await api("/api/repositories/101/sync?force=1", "POST");
    expect((await synced.json<Snapshot>()).treeSha).toBe(snapshot.treeSha);
    expect(
      (
        await env.DB.prepare("SELECT count FROM mock_requests WHERE kind = 'not-modified'").first<{
          count: number;
        }>()
      )?.count,
    ).toBe(1);
    expect(
      (
        await env.DB.prepare("SELECT count FROM mock_requests WHERE kind = 'tree'").first<{
          count: number;
        }>()
      )?.count,
    ).toBe(1);
  });
});
