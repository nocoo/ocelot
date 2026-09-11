import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleApi } from "../../worker/app";
import production from "../../worker/index";
import { authorAvatar, authorProfile } from "../../worker/profile";

const avatar = "https://b.no.mt/ocelot-test/avatar.jpg";
const email = "reader@example.test";
const empty = { name: null, avatar: null };
afterEach(() => vi.restoreAllMocks());

describe("optional author profiles behind Access", () => {
  it("looks up the normalized email hash and caches only public resources", async () => {
    const outgoing = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) =>
        String(input).startsWith("https://lizheng.blog/")
          ? Response.json({ name: "  读者 Reader  ", avatar })
          : new Response("synthetic-image", { headers: { "Content-Type": "image/jpeg" } }),
      );
    expect(await authorProfile(` ${email.toUpperCase()} `)).toEqual({
      name: "读者 Reader",
      avatar,
    });
    expect(await authorProfile(email)).toEqual({ name: "读者 Reader", avatar });
    const [url, init] = outgoing.mock.calls[0];
    expect(String(url)).toMatch(
      /^https:\/\/lizheng\.blog\/api\/authors\/profile\?hash=[a-f0-9]{64}$/u,
    );
    expect(String(url)).toBe(
      "https://lizheng.blog/api/authors/profile?hash=2cecb651356e138bd83a5215c4d7c5a3ebfb923a0c316de1b218797417911c5e",
    );
    expect(String(url)).not.toContain(email);
    expect(init).toMatchObject({ redirect: "error", signal: expect.any(AbortSignal) });
    expect(init?.headers).toEqual({
      Accept: "application/json, image/*;q=0.9",
      "User-Agent": "Ocelot (+https://github.com/nocoo/ocelot)",
    });
    const response = await authorAvatar(email);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe("synthetic-image");
    await (await authorAvatar(email)).body?.cancel();
    expect(outgoing).toHaveBeenCalledTimes(2);
    const routed = await handleApi(
      new Request("https://reader.test/api/profile?email=other@test"),
      env,
      email,
    );
    expect(await routed.json()).toEqual({ name: "读者 Reader", avatar: "/api/avatar" });
    expect(
      (
        await handleApi(
          new Request("https://reader.test/api/avatar?url=https://evil.test"),
          env,
          email,
        )
      ).status,
    ).toBe(200);
    expect(outgoing).toHaveBeenCalledTimes(2);
  });

  it("hashes normalized Unicode email as UTF-8", async () => {
    const outgoing = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(empty));
    expect(await authorProfile("  讀者@EXAMPLE.TEST  ")).toEqual(empty);
    expect(outgoing.mock.calls[0][0]).toBe(
      "https://lizheng.blog/api/authors/profile?hash=fe442d369672015baf0994cc3333f16c9f78291bc86c4fbe9bc30d9362ec44b1",
    );
  });

  it("backs off for a minute after 429 and can recover after the temporary cache expires", async () => {
    const outgoing = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Rate limited", { status: 429 }));
    const limitedEmail = "limited-reader@example.test";
    expect(await authorProfile(limitedEmail)).toEqual(empty);
    expect(await authorProfile(limitedEmail)).toEqual(empty);
    expect(outgoing).toHaveBeenCalledOnce();
    const url = String(outgoing.mock.calls[0][0]);
    const cache = await caches.open("ocelot-public-profiles");
    const cached = await cache.match(url);
    expect(cached?.headers.get("Retry-After")).toBe("60");
    expect(cached?.headers.get("Cache-Control")).toBe("public, max-age=60");
    await cache.delete(url);
    outgoing.mockResolvedValueOnce(Response.json({ name: "Recovered reader", avatar: null }));
    expect(await authorProfile(limitedEmail)).toEqual({ name: "Recovered reader", avatar: null });
    expect(outgoing).toHaveBeenCalledTimes(2);
  });

  it("rejects untrusted image origins, credentials, schemes and malformed profile values", async () => {
    const outgoing = vi.spyOn(globalThis, "fetch");
    const bodies = [null, [], {}, { name: 4, avatar: 3 }, { name: "  ", avatar: "bad" }];
    for (const [index, body] of bodies.entries()) {
      outgoing.mockResolvedValueOnce(Response.json(body));
      expect(await authorProfile(`empty-${index}@example.test`)).toEqual(empty);
    }
    for (const [index, url] of [
      "http://b.no.mt/avatar.jpg",
      "https://b.no.mt.evil.test/avatar.jpg",
      "https://b.no.mt:444/avatar.jpg",
      "https://user@b.no.mt/avatar.jpg",
      "https://:password@b.no.mt/avatar.jpg",
      "data:image/png;base64,AAAA",
      "x".repeat(2049),
    ].entries()) {
      outgoing.mockResolvedValueOnce(Response.json({ name: "Reader", avatar: url }));
      expect(await authorProfile(`url-${index}@example.test`)).toEqual({
        name: "Reader",
        avatar: null,
      });
    }
    outgoing.mockResolvedValueOnce(Response.json({ name: "中".repeat(200), avatar: null }));
    expect((await authorProfile(email)).name).toHaveLength(120);
  });

  it("falls back on timeouts, server errors, invalid JSON, MIME types and oversized bodies", async () => {
    const outgoing = vi.spyOn(globalThis, "fetch");
    const responses = [
      new Response("Offline", { status: 503 }),
      new Response(null, { status: 503 }),
      new Response("<html>Sign in</html>", { headers: { "Content-Type": "text/html" } }),
      new Response(null),
      new Response("{", { headers: { "Content-Type": "application/json" } }),
      new Response("x".repeat(8193), { headers: { "Content-Type": "application/json" } }),
    ];
    for (const [index, response] of responses.entries()) {
      outgoing.mockResolvedValueOnce(response);
      expect(await authorProfile(`failure-${index}@example.test`)).toEqual(empty);
    }
    outgoing.mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"));
    expect(await authorProfile(email)).toEqual(empty);
    outgoing.mockResolvedValueOnce(Response.json({ name: "Recovered", avatar: null }));
    expect(await authorProfile(email)).toEqual({ name: "Recovered", avatar: null });
  });

  it("serves only bounded raster avatars and leaves no general URL proxy", async () => {
    const outgoing = vi.spyOn(globalThis, "fetch");
    for (const [index, type] of ["text/html", "image/svg+xml", "image/jpeg"].entries()) {
      outgoing.mockResolvedValueOnce(
        Response.json({ name: "Reader", avatar: `${avatar}?v=${index}` }),
      );
      outgoing.mockResolvedValueOnce(
        new Response("fake", { headers: { "Content-Type": type, "Content-Length": "524289" } }),
      );
      await expect(authorAvatar(`avatar-${index}@example.test`)).rejects.toMatchObject({
        status: 404,
      });
    }
    outgoing.mockResolvedValueOnce(Response.json(empty));
    await expect(authorAvatar(email)).rejects.toMatchObject({ code: "avatar_unavailable" });
    expect(outgoing).toHaveBeenCalledTimes(7);
  });

  it("requires a verified Access session before profile lookup or avatar cache access", async () => {
    const outgoing = vi.spyOn(globalThis, "fetch");
    const bindings = {
      ...env,
      ACCESS_TEAM_DOMAIN: "https://ocelot-test.cloudflareaccess.com",
      ACCESS_AUD: "test-audience",
      OWNER_EMAIL: email,
    };
    for (const path of ["/api/profile", "/api/avatar", "/api/live"]) {
      const denied = await production.fetch(
        new Request(`https://reader.test${path}`, {
          headers: { "Cf-Access-Authenticated-User-Email": email },
        }),
        bindings,
      );
      expect(denied.status).toBe(401);
      expect(denied.headers.get("Cache-Control")).toBe("private, no-store");
      expect(denied.headers.get("Content-Security-Policy")).toContain("img-src 'self' data:");
    }
    expect(outgoing).not.toHaveBeenCalled();
  });
});
