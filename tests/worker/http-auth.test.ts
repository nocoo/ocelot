import { env } from "cloudflare:workers";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { publicKeys, verifyAccess } from "../../worker/auth";
import {
  failure,
  HttpError,
  json,
  readJson,
  readLimited,
  requireSameOrigin,
  securityHeaders,
} from "../../worker/http";
import production from "../../worker/index";
import local from "../../worker/local";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("request security and bounded bodies", () => {
  it("uses a restrictive CSP and does not expose unexpected errors", async () => {
    const response = securityHeaders(json({ ok: true }));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("Content-Security-Policy")).not.toContain(
      "script-src 'unsafe-inline'",
    );
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    const internal = failure(new Error("PAT=do-not-expose"));
    expect(internal.status).toBe(500);
    expect(await internal.text()).not.toContain("PAT");
    const throttled = failure(new HttpError(429, "limited", "Wait", Date.now() + 2000));
    expect(Number(throttled.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
    expect(failure(new HttpError(429, "limited", "Wait", 1)).headers.get("Retry-After")).toBe("1");
  });
  it("requires same-origin intent for mutations", () => {
    const request = (headers: HeadersInit, method = "POST") =>
      new Request("https://reader.test/api/repositories", { method, headers });
    expect(() => requireSameOrigin(request({}))).toThrow(HttpError);
    expect(() =>
      requireSameOrigin(request({ Origin: "https://evil.test", "X-Ocelot-Request": "1" })),
    ).toThrow(HttpError);
    expect(() => requireSameOrigin(request({ "Sec-Fetch-Site": "cross-site" }, "GET"))).toThrow(
      HttpError,
    );
    expect(() =>
      requireSameOrigin(request({ Origin: "https://reader.test", "X-Ocelot-Request": "1" })),
    ).not.toThrow();
    expect(() => requireSameOrigin(request({}, "GET"))).not.toThrow();
    expect(() => requireSameOrigin(request({}, "HEAD"))).not.toThrow();
  });
  it("bounds both declared and streamed body sizes", async () => {
    await expect(
      readLimited(new Response("small", { headers: { "Content-Length": "100" } }), 10),
    ).rejects.toMatchObject({ status: 413 });
    const chunks = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("hello"));
        controller.enqueue(new TextEncoder().encode("world"));
        controller.close();
      },
    });
    await expect(readLimited(new Response(chunks), 8)).rejects.toMatchObject({ code: "too_large" });
    expect(new TextDecoder().decode(await readLimited(new Response("hello"), 5))).toBe("hello");
    expect(await readLimited(new Response(null), 2)).toEqual(new Uint8Array());
    expect(await readJson(new Response('{"read":true}'))).toEqual({ read: true });
    await expect(readJson(new Response("{"))).rejects.toThrow(SyntaxError);
  });
});

describe("Cloudflare Access JWT verification", () => {
  const config = {
    ACCESS_TEAM_DOMAIN: "https://ocelot-test.cloudflareaccess.com",
    ACCESS_AUD: "test-audience",
    OWNER_EMAIL: "reader@example.test",
  };
  let privateKey: CryptoKey;
  let jwk: Awaited<ReturnType<typeof exportJWK>>;
  beforeAll(async () => {
    const keys = await generateKeyPair("RS256", { extractable: true });
    privateKey = keys.privateKey;
    jwk = { ...(await exportJWK(keys.publicKey)), kid: "ocelot-test", alg: "RS256", use: "sig" };
  });
  const keys = () => createLocalJWKSet({ keys: [jwk] });
  async function token(
    payload: Record<string, unknown> = {},
    audience = config.ACCESS_AUD,
    issuer = config.ACCESS_TEAM_DOMAIN,
  ) {
    return new SignJWT({ sub: "test-user", email: config.OWNER_EMAIL, type: "app", ...payload })
      .setProtectedHeader({ alg: "RS256", kid: "ocelot-test" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime((payload.exp as number) ?? "1h")
      .sign(privateKey);
  }
  const request = (token?: string, path = "/api/session") =>
    new Request(`https://reader.test${path}`, {
      headers: token ? { "Cf-Access-Jwt-Assertion": token } : {},
    });
  it("verifies signatures, issuer, audience, required claims and the single owner", async () => {
    const jwt = await token({ email: "READER@example.test" });
    expect(await verifyAccess(request(jwt), config, keys())).toBe("READER@example.test");
    await expect(verifyAccess(request(), config, keys())).rejects.toMatchObject({ status: 401 });
    for (const bad of [
      await token({}, "other"),
      await token({}, config.ACCESS_AUD, "https://other.cloudflareaccess.com"),
      await token({ exp: Math.floor(Date.now() / 1000) - 60 }),
      await token({ nbf: Math.floor(Date.now() / 1000) + 60 }),
      `${jwt.slice(0, -8)}tampered`,
      "not-a-jwt",
    ])
      await expect(verifyAccess(request(bad), config, keys())).rejects.toMatchObject({
        code: "access_required",
      });
    for (const payload of [{ email: "someone@example.test" }, { email: 1 }, { type: "service" }])
      await expect(
        verifyAccess(request(await token(payload)), config, keys()),
      ).rejects.toMatchObject({ status: 403 });
    const missingEmail = await new SignJWT({ sub: "user", type: "app" })
      .setProtectedHeader({ alg: "RS256", kid: "ocelot-test" })
      .setAudience(config.ACCESS_AUD)
      .setIssuer(config.ACCESS_TEAM_DOMAIN)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);
    await expect(verifyAccess(request(missingEmail), config, keys())).rejects.toMatchObject({
      status: 401,
    });
  });
  it("fails closed for incomplete Access configuration", async () => {
    for (const patch of [
      { ACCESS_TEAM_DOMAIN: "http://evil.test" },
      { ACCESS_AUD: "configure-before-deployment" },
      { OWNER_EMAIL: "unconfigured" },
    ])
      await expect(verifyAccess(request(), { ...config, ...patch }, keys())).rejects.toMatchObject({
        code: "access_setup",
      });
  });
  it("caches only public verification keys and supports the production entry", async () => {
    const endpoint = `${config.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`;
    const outgoing = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ keys: [jwk] }));
    const first = await publicKeys(endpoint);
    expect((await first.json<{ keys: unknown[] }>()).keys).toHaveLength(1);
    const cached = await publicKeys(endpoint);
    expect(cached.status).toBe(200);
    await cached.body?.cancel();
    const jwt = await token();
    const bindings = { ...env, ...config };
    expect(await verifyAccess(request(jwt), bindings)).toBe(config.OWNER_EMAIL);
    const session = await production.fetch(request(jwt), bindings);
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({ local: false, email: config.OWNER_EMAIL });
    const assets: Fetcher = {
      fetch: vi.fn(async () => new Response("<html>Private shell</html>")),
      connect: vi.fn(() => {
        throw new Error("No outgoing sockets");
      }),
    };
    const asset = await production.fetch(request(jwt, "/assets/main.js"), {
      ...bindings,
      ASSETS: assets,
    });
    expect(asset.status).toBe(200);
    expect(assets.fetch).toHaveBeenCalledOnce();
    const denied = await production.fetch(request(undefined, "/assets/main.js"), {
      ...bindings,
      ASSETS: assets,
    });
    expect(denied.status).toBe(401);
    expect(assets.fetch).toHaveBeenCalledOnce();
    const hiddenLocal = await production.fetch(request(jwt, "/api/local"), bindings);
    expect(hiddenLocal.status).toBe(404);
    await production.scheduled({} as ScheduledController, bindings);
    await local.scheduled({} as ScheduledController, env);
    expect(outgoing).toHaveBeenCalledOnce();
  });
  it("does not cache failed certificate responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Unavailable", { status: 503 }));
    const response = await publicKeys(`${config.ACCESS_TEAM_DOMAIN}/unavailable-certs`);
    expect(response.status).toBe(503);
    await response.body?.cancel();
    expect(
      await (await caches.open("ocelot-public-access-keys")).match(
        `${config.ACCESS_TEAM_DOMAIN}/unavailable-certs`,
      ),
    ).toBeUndefined();
  });
});
