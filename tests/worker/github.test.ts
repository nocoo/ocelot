import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expiration, GitHub, retryTime, type Transport } from "../../worker/github";
import { connection } from "../../worker/store";

const a = "a".repeat(40);
const b = "b".repeat(40);
const c = "c".repeat(40);
const reply = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), { status, headers });
afterEach(() => {
  vi.restoreAllMocks();
});

describe("GitHub read-only transport", () => {
  it("uses scoped headers, stops redirects, and honors expiry metadata", async () => {
    const transport = vi
      .fn<Transport>()
      .mockResolvedValue(
        reply({}, 200, { "github-authentication-token-expiration": "2026-10-01" }),
      );
    const github = new GitHub(env, transport);
    await (await github.request("/user")).body?.cancel();
    const request = transport.mock.calls[0][0];
    expect(request.method).toBe("GET");
    expect(request.redirect).toBe("manual");
    expect(request.headers.get("Authorization")).toBe("Bearer synthetic-local-credential");
    expect(request.headers.get("User-Agent")).toBe("Ocelot-Reader");
    expect((await connection(env)).expiresAt).toBe("2026-10-01T00:00:00.000Z");
    const custom = new GitHub({ ...env, GITHUB_TOKEN_EXPIRES_AT: "2026-11-01" }, async () =>
      reply({}),
    );
    await (await custom.request("/user", { Accept: "application/custom" })).body?.cancel();
    expect((await connection(env)).expiresAt).toBe("2026-11-01T00:00:00.000Z");
    expect(expiration("nonsense")).toBeNull();
    expect(expiration(null)).toBeNull();
  });
  it("can use the actual global fetch in the Workers runtime", async () => {
    const outgoing = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ login: "demo" }));
    expect(await (await new GitHub(env).request("/user")).json()).toEqual({ login: "demo" });
    expect(outgoing).toHaveBeenCalledOnce();
  });
  it.each([
    [401, {}, 424, "github_invalid"],
    [403, {}, 403, "github_permission"],
    [404, {}, 403, "github_permission"],
    [
      403,
      { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": "9999999999" },
      429,
      "github_limited",
    ],
    [403, { "Retry-After": "20" }, 429, "github_limited"],
    [429, {}, 429, "github_limited"],
    [500, {}, 503, "github_offline"],
    [301, { Location: "https://evil.test" }, 503, "github_offline"],
  ])(
    "classifies HTTP %s without exposing upstream response bodies",
    async (status, headers, expectedStatus, code) => {
      const github = new GitHub(
        env,
        async () =>
          new Response("sensitive upstream details", {
            status: Number(status),
            headers: headers as HeadersInit,
          }),
      );
      await expect(github.request("/user")).rejects.toMatchObject({ status: expectedStatus, code });
      const state = await connection(env);
      if (code === "github_invalid") expect(state.status).toBe("invalid");
      if (code === "github_limited") expect(state.retryAt).toBeGreaterThan(Date.now());
    },
  );
  it("handles missing PAT, disconnected upstream and shared backoff without more requests", async () => {
    const transport = vi.fn<Transport>();
    await expect(
      new GitHub({ ...env, GITHUB_TOKEN: "" }, transport).request("/user"),
    ).rejects.toMatchObject({ code: "github_invalid" });
    expect(transport).not.toHaveBeenCalled();
    transport.mockRejectedValue(new TypeError("network"));
    await expect(new GitHub(env, transport).request("/user")).rejects.toMatchObject({
      code: "github_offline",
    });
    expect((await connection(env)).status).toBe("offline");
    await env.DB.prepare("UPDATE connection SET retry_at = ?")
      .bind(Date.now() + 60_000)
      .run();
    transport.mockClear();
    await expect(new GitHub(env, transport).request("/user")).rejects.toMatchObject({
      code: "github_limited",
    });
    expect(transport).not.toHaveBeenCalled();
  });
  it("parses numeric, HTTP-date and reset-based retry advice", () => {
    const now = Date.parse("2026-09-11T00:00:00Z");
    expect(retryTime(new Headers({ "Retry-After": "10" }), now)).toBe(now + 10_000);
    expect(retryTime(new Headers({ "Retry-After": "0" }), now)).toBe(now + 1000);
    expect(retryTime(new Headers({ "Retry-After": "Fri, 11 Sep 2026 00:01:00 GMT" }), now)).toBe(
      now + 60_000,
    );
    expect(retryTime(new Headers({ "Retry-After": "invalid" }), now)).toBe(now + 60_000);
    expect(
      retryTime(new Headers({ "X-RateLimit-Reset": String((now + 90_000) / 1000) }), now),
    ).toBe(now + 90_000);
    expect(retryTime(new Headers(), now)).toBe(now + 60_000);
  });
  it("validates repository identity and complete commit responses", async () => {
    const valid = {
      id: 1,
      owner: { login: "demo" },
      name: "garden",
      default_branch: "main",
      private: false,
    };
    for (const repository of [
      {},
      { ...valid, id: 0 },
      { ...valid, id: 1.5 },
      { ...valid, owner: {} },
      { ...valid, name: "" },
      { ...valid, default_branch: "" },
      { ...valid, private: "yes" },
    ]) {
      await expect(
        new GitHub(env, async () => reply(repository)).repository("/repos/demo/garden"),
      ).rejects.toMatchObject({ code: "github_response" });
    }
    expect(
      (await new GitHub(env, async () => reply(valid)).repository("/repos/demo/garden")).id,
    ).toBe(1);
    expect(
      await new GitHub(env, async () =>
        reply({ sha: a, commit: { tree: { sha: b } } }, 200, { ETag: '"head"' }),
      ).head(1, "notes/main", null),
    ).toEqual({ sha: a, tree: b, etag: '"head"' });
    expect(
      await new GitHub(env, async () => new Response(null, { status: 304 })).head(
        1,
        "main",
        '"head"',
      ),
    ).toBeNull();
    for (const commit of [{}, { sha: a }, { sha: a, commit: { tree: { sha: "bad" } } }])
      await expect(
        new GitHub(env, async () => reply(commit)).head(1, "main", null),
      ).rejects.toMatchObject({ code: "github_response" });
  });
});

describe("complete, bounded Git snapshots", () => {
  it("includes regular files, excludes symlinks/submodules/hidden files and checks paths", async () => {
    const tree = [
      { path: "b.md", sha: b, mode: "100644", type: "blob", size: 50 },
      { path: "a.md", sha: c, mode: "100755", type: "blob" },
      { path: ".env", sha: b, mode: "100644", type: "blob" },
      { path: "../escape.md", sha: b, mode: "100644", type: "blob" },
      { path: "link", sha: b, mode: "120000", type: "blob" },
      { path: "submodule", sha: b, mode: "160000", type: "commit" },
      { path: "bad.md", sha: "invalid", mode: "100644", type: "blob" },
    ];
    expect(
      await new GitHub(env, async () => reply({ sha: a, truncated: false, tree })).tree(1, a),
    ).toEqual([
      { path: "a.md", sha: c, size: 0 },
      { path: "b.md", sha: b, size: 50 },
    ]);
  });
  it("walks individual trees when GitHub truncates the recursive response", async () => {
    const transport = vi.fn<Transport>().mockImplementation(async (request) => {
      const url = new URL(request.url);
      if (url.search)
        return reply({
          sha: a,
          truncated: true,
          tree: [{ path: "partial.md", sha: c, type: "blob", mode: "100644" }],
        });
      if (url.pathname.endsWith(a))
        return reply({
          sha: a,
          truncated: false,
          tree: [
            { path: "folder", type: "tree", sha: b },
            { path: ".hidden", type: "tree", sha: c },
            { path: "invalid", type: "tree", sha: "bad" },
            { path: "root.md", type: "blob", mode: "100644", sha: c, size: 4 },
          ],
        });
      return reply({
        sha: b,
        truncated: false,
        tree: [{ path: "note.md", type: "blob", mode: "100644", sha: c, size: 5 }],
      });
    });
    const files = await new GitHub(env, transport).tree(1, a);
    expect(files.map((file) => file.path)).toEqual(["folder/note.md", "root.md"]);
    expect(transport).toHaveBeenCalledTimes(3);
  });
  it("fails explicitly for malformed or still-truncated trees", async () => {
    for (const body of [
      { sha: b, tree: [] },
      { sha: a, tree: null },
    ])
      await expect(new GitHub(env, async () => reply(body)).tree(1, a)).rejects.toMatchObject({
        code: "github_response",
      });
    await expect(
      new GitHub(env, async () => reply({ sha: a, truncated: true, tree: [] })).tree(1, a),
    ).rejects.toMatchObject({ code: "tree_truncated" });
  });
  it("caps file count and total traversal duration", async () => {
    const tree = Array.from({ length: 20_001 }, (_, index) => ({
      path: `${index}.md`,
      sha: b,
      mode: "100644",
      type: "blob",
    }));
    await expect(
      new GitHub(env, async () => reply({ sha: a, truncated: false, tree })).tree(1, a),
    ).rejects.toMatchObject({ code: "tree_too_large" });
    const now = Date.now();
    const transport: Transport = async (request) => {
      if (new URL(request.url).search) return reply({ sha: a, truncated: true, tree: [] });
      vi.spyOn(Date, "now").mockReturnValue(now + 120_000);
      return reply({ sha: a, truncated: false, tree: [{ path: "child", type: "tree", sha: b }] });
    };
    await expect(new GitHub(env, transport).tree(1, a)).rejects.toMatchObject({
      code: "tree_too_large",
    });
  });
  it("reads immutable blobs as bounded raw bytes", async () => {
    const transport = vi.fn<Transport>().mockResolvedValue(new Response("note"));
    expect(new TextDecoder().decode(await new GitHub(env, transport).blob(1, a, 8))).toBe("note");
    expect(transport.mock.calls[0][0].headers.get("Accept")).toBe(
      "application/vnd.github.raw+json",
    );
    await expect(
      new GitHub(env, async () => new Response("too long")).blob(1, a, 2),
    ).rejects.toMatchObject({ status: 413 });
  });
});
