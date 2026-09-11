import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockGitHub, scenario } from "../../mock/github";
import { version } from "../../package.json";
import type { Snapshot } from "../../src/models/contracts";
import local from "../../worker/local";

function request(path: string, method = "GET", body?: unknown, headers: HeadersInit = {}) {
  return new Request(`http://127.0.0.1${path}`, {
    method,
    headers: { "X-Ocelot-Request": "1", "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const api = (path: string, method = "GET", body?: unknown) =>
  local.fetch(request(path, method, body), env);
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("local API boundaries and scenarios", () => {
  it("handles registration, metadata, short sync responses, assets and removal through the HTTP router", async () => {
    expect((await api("/api/session")).status).toBe(200);
    const live = await api("/api/live");
    expect(await live.json()).toEqual({ version, deployment: env.VERSION_METADATA });
    expect(live.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await (await api("/api/profile")).json()).toEqual({ name: null, avatar: null });
    expect((await api("/api/avatar")).status).toBe(404);
    expect(await (await api("/api/repositories")).json()).toEqual([]);
    const added = await api("/api/repositories", "POST", { repository: "ocelot-demo/fieldnotes" });
    expect(added.status).toBe(201);
    const snapshot = await added.json<Snapshot>();
    expect((await api("/api/repositories/101/snapshot")).status).toBe(200);
    expect((await api(`/api/repositories/101/snapshot?tree=${snapshot.treeSha}`)).status).toBe(200);
    const unchanged = await api(`/api/repositories/101/sync?known=${snapshot.treeSha}`, "POST");
    expect(await unchanged.json()).toMatchObject({ unchanged: true, repository: { id: 101 } });
    expect(
      (
        await api(
          `/api/repositories/101/asset?${new URLSearchParams({ tree: snapshot.treeSha, path: "附件/blue-hour.png" })}`,
        )
      ).headers.get("Content-Type"),
    ).toBe("image/png");
    expect((await api("/api/connection/check", "POST")).status).toBe(200);
    expect((await api("/api/repositories/101", "DELETE")).status).toBe(200);
    expect((await api("/api/repositories/101/snapshot")).status).toBe(404);
  });
  it("validates body type, size, method, IDs and endpoint parameters", async () => {
    for (const body of [null, {}, { repository: 1 }])
      expect((await api("/api/repositories", "POST", body)).status).toBe(400);
    const malformed = new Request("http://127.0.0.1/api/repositories", {
      method: "POST",
      body: "{",
      headers: { "X-Ocelot-Request": "1" },
    });
    expect((await local.fetch(malformed, env)).status).toBe(400);
    expect((await api("/api/repositories", "POST", { repository: "x".repeat(3000) })).status).toBe(
      413,
    );
    for (const path of [
      "/api/unknown",
      "/api/repositories/0/snapshot",
      "/api/repositories/9999999999999999/snapshot",
      "/api/repositories/1",
      "/api/repositories/1/sync",
    ])
      expect((await api(path)).status).toBe(404);
    expect((await api("/api/repositories", "PATCH")).status).toBe(404);
    expect((await api("/api/repositories/101/document")).status).toBe(400);
  });
  it("accepts only loopback hosts and the registered HTTPS or Vite proxy origins", async () => {
    expect(
      (await local.fetch(new Request("https://exposed.example.test/api/session"), env)).status,
    ).toBe(403);
    for (const origin of [
      "https://ocelot.dev.hexly.ai",
      "http://127.0.0.1:7049",
      "http://localhost:27049",
    ])
      expect(
        (
          await local.fetch(
            request("/api/local", "POST", { scenario: "healthy" }, { Origin: origin }),
            env,
          )
        ).status,
      ).toBe(200);
    for (const origin of [
      "https://evil.test",
      "https://ocelot.dev.hexly.ai.evil.test",
      "http://ocelot.dev.hexly.ai",
      "http://127.0.0.1:5173",
    ])
      expect(
        (
          await local.fetch(
            request("/api/local", "POST", { scenario: "healthy" }, { Origin: origin }),
            env,
          )
        ).status,
      ).toBe(403);
    expect(
      (
        await local.fetch(
          request(
            "/api/local",
            "POST",
            { scenario: "healthy" },
            { Origin: "https://ocelot.dev.hexly.ai", "Sec-Fetch-Site": "cross-site" },
          ),
          env,
        )
      ).status,
    ).toBe(403);
  });
  it("provides controlled local scenarios and validates scenario input", async () => {
    expect(await (await api("/api/local")).json()).toMatchObject({
      scenario: "healthy",
      requests: {},
    });
    expect((await api("/api/local", "DELETE")).status).toBe(405);
    for (const body of [null, {}, { scenario: "not-a-scenario" }])
      expect((await api("/api/local", "POST", body)).status).toBe(400);
    expect(
      (
        await local.fetch(
          new Request("http://127.0.0.1/api/local", {
            method: "POST",
            body: "{",
            headers: { "X-Ocelot-Request": "1" },
          }),
          env,
        )
      ).status,
    ).toBe(400);
    await api("/api/local", "POST", { scenario: "expiring" });
    await api("/api/connection/check", "POST");
    const state = await (await api("/api/session")).json<{ connection: { expiresAt: string } }>();
    expect(Date.parse(state.connection.expiresAt) - Date.now()).toBeLessThanOrEqual(3 * 86_400_000);
    await api("/api/local", "POST", { scenario: "invalid" });
    expect((await api("/api/connection/check", "POST")).status).toBe(424);
    await api("/api/local", "POST", { scenario: "limited" });
    expect((await api("/api/connection/check", "POST")).status).toBe(429);
    await api("/api/local", "POST", { scenario: "healthy" });
    expect((await api("/api/connection/check", "POST")).status).toBe(200);
    await env.DB.prepare("DELETE FROM mock_state").run();
    expect(await scenario(env)).toBe("healthy");
  });
  it("slows metadata and blobs without changing the real GitHub client contract", async () => {
    vi.useFakeTimers();
    await env.DB.prepare("UPDATE mock_state SET scenario = 'slow'").run();
    const transport = mockGitHub(env);
    const make = (path: string) =>
      new Request(`https://api.github.com${path}`, {
        headers: { Authorization: "Bearer synthetic-local-credential" },
      });
    const metadata = transport(make("/repositories/101"));
    await vi.advanceTimersByTimeAsync(1000);
    expect((await metadata).status).toBe(200);
    const blob = transport(make(`/repositories/101/git/blobs/${"f".repeat(40)}`));
    await vi.advanceTimersByTimeAsync(2000);
    expect((await blob).status).toBe(404);
  });
  it("does not serve unknown repositories, cross-repository blobs or unauthenticated mock requests", async () => {
    const transport = mockGitHub(env);
    expect((await transport(new Request("https://api.github.com/user"))).status).toBe(401);
    const make = (path: string) =>
      new Request(`https://api.github.com${path}`, {
        headers: { Authorization: "Bearer synthetic-local-credential" },
      });
    expect((await transport(make("/repos/demo/missing"))).status).toBe(404);
    expect((await transport(make("/repositories/101/unknown"))).status).toBe(404);
    const snapshot = await (
      await api("/api/repositories", "POST", { repository: "ocelot-demo/fieldnotes" })
    ).json<Snapshot>();
    expect(
      (await transport(make(`/repositories/102/git/blobs/${snapshot.files[0].sha}`))).status,
    ).toBe(404);
  });
});
