import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError } from "../../src/services/api";
import { browserServices, readRoute } from "../../src/services/browser";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("HTTP client", () => {
  it("uses same-origin noncached requests without exposing credentials", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ done: true }));
    const api = new ApiClient(transport);
    const controller = new AbortController();
    expect(await api.request("/api/test", "POST", { example: "中文" }, controller.signal)).toEqual({
      done: true,
    });
    expect(transport).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        body: '{"example":"中文"}',
        headers: { "Content-Type": "application/json", "X-Ocelot-Request": "1" },
      }),
    );
    expect(JSON.stringify(transport.mock.calls)).not.toContain("Bearer");
  });
  it("maps every API operation to the expected endpoint", async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({}));
    vi.stubGlobal("fetch", transport);
    const api = new ApiClient();
    await api.session();
    await api.repositories();
    await api.add("owner/garden");
    await api.remove(3);
    await api.sync(3);
    await api.sync(3, true);
    await api.document(3, "tree", "中文.md");
    await api.checkConnection();
    await api.local();
    await api.local("expiring");
    await api.profile();
    expect(transport.mock.calls.map(([url]) => url)).toEqual([
      "/api/session",
      "/api/repositories",
      "/api/repositories",
      "/api/repositories/3",
      "/api/repositories/3/sync",
      "/api/repositories/3/sync?force=1",
      "/api/repositories/3/document?tree=tree&path=%E4%B8%AD%E6%96%87.md",
      "/api/connection/check",
      "/api/local",
      "/api/local",
      "/api/profile",
    ]);
    expect(transport.mock.calls[9][1]?.body).toBe('{"scenario":"expiring"}');
  });
  it("separates aborts, network failure, expired Access sessions and typed upstream errors", async () => {
    const transport = vi.fn<typeof fetch>();
    const api = new ApiClient(transport);
    const aborted = new DOMException("Cancelled", "AbortError");
    transport.mockRejectedValueOnce(aborted);
    await expect(api.session()).rejects.toBe(aborted);
    transport.mockRejectedValueOnce(new TypeError("network internals"));
    await expect(api.session()).rejects.toMatchObject({
      code: "network",
      message: "暂时无法连接阅读器，请检查网络后重试。",
    });
    transport.mockResolvedValueOnce(new Response("<html>Access login</html>"));
    await expect(api.session()).rejects.toMatchObject({ code: "access_required" });
    transport.mockResolvedValueOnce(
      Response.json(
        { error: { code: "github_limited", message: "Wait", retryAt: 99 } },
        { status: 429 },
      ),
    );
    await expect(api.session()).rejects.toMatchObject({ code: "github_limited", retryAt: 99 });
    transport.mockResolvedValueOnce(Response.json({}, { status: 500 }));
    await expect(api.session()).rejects.toBeInstanceOf(ApiError);
    transport.mockResolvedValueOnce(Response.json({ error: {} }, { status: 500 }));
    await expect(api.session()).rejects.toMatchObject({ code: "request" });
  });
  it("sends the known tree so unchanged checks do not download the directory again", async () => {
    const unchanged = { unchanged: true, repository: { id: 101, checkedAt: 123 } };
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json(unchanged));
    const api = new ApiClient(transport);
    expect(await api.sync(101, true, "a".repeat(40))).toEqual(unchanged);
    expect(transport).toHaveBeenCalledWith(
      `/api/repositories/101/sync?force=1&known=${"a".repeat(40)}`,
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("browser integration", () => {
  function platform() {
    const storage = new Map<string, string>();
    const win = Object.assign(new EventTarget() as Window, {
      location: {
        href: "https://reader.test/?repo=101&note=hello.md#note-hi",
      },
      history: { pushState: vi.fn(), replaceState: vi.fn() },
      localStorage: {
        getItem: vi.fn((key: string) => storage.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          storage.set(key, value);
        }),
      },
    });
    const doc = Object.assign(new EventTarget(), {
      visibilityState: "visible" as DocumentVisibilityState,
    });
    return { win, doc, storage, services: browserServices(win as Window, doc as Document) };
  }
  it("round-trips deep links and ignores malformed repository IDs or fragments", () => {
    expect(readRoute("https://reader.test/?repo=101&note=%E4%B8%AD%E6%96%87.md#note-hi")).toEqual({
      repository: 101,
      path: "中文.md",
      anchor: "note-hi",
    });
    expect(readRoute("https://reader.test/")).toEqual({ repository: null, path: null, anchor: "" });
    for (const id of ["0", "-3", "NaN", "1.5", "9999999999999999999"])
      expect(readRoute(`https://reader.test/?repo=${id}#%zz`).repository).toBeNull();
    expect(readRoute("https://reader.test/#%zz").anchor).toBe("");
  });
  it("stores only bounded reading preferences, with storage-denied fallbacks", () => {
    const { services, win, storage } = platform();
    expect(services.readScale()).toBe(1);
    services.writeScale(1.15);
    expect(services.readScale()).toBe(1.15);
    storage.set("ocelot-font-scale", "NaN");
    expect(services.readScale()).toBe(1);
    storage.set("ocelot-font-scale", "2");
    expect(services.readScale()).toBe(1);
    win.localStorage.getItem.mockImplementationOnce(() => {
      throw new Error("Storage blocked");
    });
    expect(services.readScale()).toBe(1);
    win.localStorage.setItem.mockImplementationOnce(() => {
      throw new Error("Storage blocked");
    });
    expect(() => services.writeScale(1)).not.toThrow();
    expect([...storage.keys()]).toEqual(["ocelot-font-scale"]);
    expect(services.route().path).toBe("hello.md");
    services.navigate("/?repo=101", false);
    services.navigate("/", true);
    expect(win.history.pushState).toHaveBeenCalledWith(null, "", "/?repo=101");
    expect(win.history.replaceState).toHaveBeenCalledWith(null, "", "/");
  });
  it("defaults to a limited width and persists only a boolean preference", () => {
    const { services, win, storage } = platform();
    expect(services.readFullWidth()).toBe(false);
    services.writeFullWidth(true);
    expect(services.readFullWidth()).toBe(true);
    services.writeFullWidth(false);
    expect(services.readFullWidth()).toBe(false);
    storage.set("ocelot-full-width", "invalid");
    expect(services.readFullWidth()).toBe(false);
    win.localStorage.getItem.mockImplementationOnce(() => {
      throw new Error("Storage blocked");
    });
    expect(services.readFullWidth()).toBe(false);
    win.localStorage.setItem.mockImplementationOnce(() => {
      throw new Error("Storage blocked");
    });
    expect(() => services.writeFullWidth(true)).not.toThrow();
    expect([...storage.keys()]).toEqual(["ocelot-full-width"]);
  });
  it("listens for visibility, back/forward and the search shortcut, and cleans up", () => {
    const { services, win, doc } = platform();
    const navigate = vi.fn();
    const visible = vi.fn();
    const search = vi.fn();
    const stop = services.listen(navigate, visible, search);
    expect(services.visible()).toBe(true);
    win.dispatchEvent(new Event("popstate"));
    expect(navigate).toHaveBeenCalledOnce();
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(visible).not.toHaveBeenCalled();
    expect(services.visible()).toBe(false);
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(visible).toHaveBeenCalledOnce();
    for (const keys of [
      { key: "K", metaKey: true, ctrlKey: false },
      { key: "k", ctrlKey: true, metaKey: false },
    ]) {
      const event = Object.assign(new Event("keydown", { cancelable: true }), keys);
      doc.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    doc.dispatchEvent(
      Object.assign(new Event("keydown"), { key: "k", metaKey: false, ctrlKey: false }),
    );
    doc.dispatchEvent(
      Object.assign(new Event("keydown"), { key: "x", metaKey: true, ctrlKey: false }),
    );
    expect(search).toHaveBeenCalledTimes(2);
    stop();
    win.dispatchEvent(new Event("popstate"));
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(navigate).toHaveBeenCalledOnce();
    expect(visible).toHaveBeenCalledOnce();
  });
});
