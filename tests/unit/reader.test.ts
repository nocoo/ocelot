import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocumentContent, Session, Snapshot } from "../../src/models/contracts";
import { ApiClient, ApiError } from "../../src/services/api";
import type { BrowserServices } from "../../src/services/browser";
import { ReaderViewModel } from "../../src/viewmodels/reader";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const hash = (char: string) => char.repeat(40);
function snapshot(id = 101, tree = "a"): Snapshot {
  return {
    repository: {
      id,
      owner: "demo",
      name: `garden-${id}`,
      branch: "main",
      private: true,
      description: "A garden",
      commitSha: hash("c"),
      treeSha: hash(tree),
      checkedAt: 1,
      authorization: "allowed",
    },
    treeSha: hash(tree),
    commitSha: hash("c"),
    files: ["README.md", "Second.md", "Third.md", "image.png", "unsafe.svg"].map((path) => ({
      path,
      sha: hash("b"),
      size: 30,
    })),
  };
}
function document(
  path = "README.md",
  tree = "a",
  content = `# ${path}\n\nA paragraph.`,
): DocumentContent {
  return { path, treeSha: hash(tree), sha: hash("b"), content };
}

function setup(local = true) {
  const api = new ApiClient();
  const current = snapshot();
  const session: Session = {
    email: "reader@example.test",
    local,
    connection: { status: "healthy", checkedAt: 1, expiresAt: null, retryAt: 0 },
  };
  vi.spyOn(api, "session").mockImplementation(async () => structuredClone(session));
  vi.spyOn(api, "repositories").mockResolvedValue([current.repository, snapshot(102).repository]);
  vi.spyOn(api, "sync").mockImplementation(async (id) => snapshot(id));
  vi.spyOn(api, "document").mockImplementation(async (_id, tree, path) => ({
    ...document(path),
    treeSha: tree,
  }));
  vi.spyOn(api, "checkConnection").mockResolvedValue(session.connection);
  vi.spyOn(api, "add").mockResolvedValue(snapshot(103));
  vi.spyOn(api, "remove").mockResolvedValue({ removed: true });
  vi.spyOn(api, "local").mockImplementation(async (scenario) => ({
    scenario: scenario ?? "healthy",
    requests: {},
    repositories: ["demo/garden"],
  }));
  const browser: BrowserServices = {
    route: vi.fn(() => ({ repository: 101, path: "README.md", anchor: "" })),
    navigate: vi.fn(),
    visible: vi.fn(() => true),
    listen: vi.fn(() => vi.fn()),
    readScale: vi.fn(() => 1),
    writeScale: vi.fn(),
    copy: vi.fn(async () => undefined),
    origin: vi.fn(() => "https://reader.test"),
  };
  const model = new ReaderViewModel(api, browser);
  return { api, model, browser, current, session };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("reading state and navigation", () => {
  it("opens a deep-linked repository and exposes stable external-store snapshots", async () => {
    const { api, model, browser } = setup();
    const changed = vi.fn();
    const unsubscribe = model.subscribe(changed);
    expect(model.getSnapshot().booting).toBe(true);
    await model.start();
    expect(model.getSnapshot()).toMatchObject({
      booting: false,
      loading: false,
      reading: { path: "README.md", parsed: { title: "README.md" } },
    });
    expect(api.sync).toHaveBeenCalledWith(101);
    expect(browser.navigate).toHaveBeenLastCalledWith("/?repo=101&note=README.md", true);
    expect(changed).toHaveBeenCalled();
    unsubscribe();
    changed.mockClear();
    model.setQuery("Second");
    expect(changed).not.toHaveBeenCalled();
    expect(model.searchResults().map((file) => file.path)).toEqual(["Second.md"]);
    model.openDialog("search");
    expect(model.getSnapshot().query).toBe("");
    model.openDialog(null);
    model.dismissError();
    expect(model.getSnapshot().dialog).toBeNull();
  });
  it("handles an empty account without making source requests", async () => {
    const { api, model } = setup();
    vi.mocked(api.repositories).mockResolvedValue([]);
    await model.selectNote("README.md");
    await model.applyUpdate();
    await model.copyLink();
    await model.check();
    expect(model.searchResults()).toEqual([]);
    await model.start();
    expect(api.sync).not.toHaveBeenCalled();
    expect(model.getSnapshot().booting).toBe(false);
  });
  it("keeps bootstrap errors actionable and ignores superseded starts", async () => {
    const { api, model } = setup();
    vi.mocked(api.session).mockRejectedValueOnce(new ApiError("access_required", "Sign in"));
    await model.start();
    expect(model.getSnapshot().error?.code).toBe("access_required");
    const delayed = deferred<Session>();
    vi.mocked(api.session).mockReturnValueOnce(delayed.promise);
    const older = model.start();
    await model.start();
    delayed.resolve({
      email: "old",
      local: false,
      connection: { status: "invalid", checkedAt: 0, expiresAt: null, retryAt: 0 },
    });
    await older;
    expect(model.getSnapshot().session?.email).toBe("reader@example.test");
    const rejected = deferred<Session>();
    vi.mocked(api.session).mockReturnValueOnce(rejected.promise);
    const failing = model.start();
    await model.start();
    rejected.reject(new Error("old error"));
    await failing;
    expect(model.getSnapshot().error).toBeNull();
  });
  it("preserves the old article until the next one is ready and ignores late responses", async () => {
    const { api, model } = setup();
    await model.start();
    const second = deferred<DocumentContent>();
    const third = deferred<DocumentContent>();
    vi.mocked(api.document).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise);
    const openingSecond = model.selectNote("Second.md");
    expect(model.getSnapshot()).toMatchObject({
      loading: true,
      pendingPath: "Second.md",
      reading: { path: "README.md" },
    });
    const signal = vi.mocked(api.document).mock.calls.at(-1)?.[3];
    const openingThird = model.selectNote("Third.md");
    expect(signal?.aborted).toBe(true);
    third.resolve(document("Third.md"));
    await openingThird;
    second.resolve(document("Second.md"));
    await openingSecond;
    expect(model.getSnapshot().reading?.path).toBe("Third.md");
    expect(model.getSnapshot().loading).toBe(false);
  });
  it("navigates anchors without fetching again, including browser history", async () => {
    const { api, model, browser } = setup();
    await model.start();
    vi.mocked(api.document).mockClear();
    await model.selectNote("README.md", "note-part");
    expect(api.document).not.toHaveBeenCalled();
    expect(model.getSnapshot().navigation.anchor).toBe("note-part");
    expect(browser.navigate).toHaveBeenLastCalledWith("/?repo=101&note=README.md#note-part", false);
    await model.selectNote("README.md");
    expect(model.getSnapshot().navigation.preserve).toBe(true);
    vi.mocked(browser.route).mockReturnValue({ repository: 101, path: "Second.md", anchor: "" });
    await model.followLocation();
    expect(browser.navigate).toHaveBeenLastCalledWith("/?repo=101&note=Second.md", true);
    vi.mocked(browser.route).mockReturnValue({ repository: 102, path: null, anchor: "" });
    await model.followLocation();
    expect(model.getSnapshot().snapshot?.repository.id).toBe(102);
  });
  it("falls back for missing deep links and shows empty repositories", async () => {
    const { model, api, browser } = setup();
    vi.mocked(browser.route).mockReturnValue({ repository: 999, path: "Deleted.md", anchor: "" });
    await model.start();
    expect(model.getSnapshot().reading?.path).toBe("README.md");
    vi.mocked(api.sync).mockResolvedValueOnce({ ...snapshot(103), files: [] });
    await model.selectRepository(103);
    expect(model.getSnapshot()).toMatchObject({ reading: null, pending: null, loading: false });
  });
  it("rejects unsupported or absent files without replacing the current article", async () => {
    const { model, api } = setup();
    await model.start();
    await model.selectNote("missing.md");
    expect(model.getSnapshot().error?.code).toBe("file_missing");
    await model.selectNote("unsafe.svg");
    expect(model.getSnapshot().error?.code).toBe("file_unsupported");
    expect(model.getSnapshot().reading?.path).toBe("README.md");
    vi.mocked(api.document).mockClear();
    await model.selectNote("image.png");
    expect(api.document).not.toHaveBeenCalled();
    expect(model.getSnapshot().reading).toMatchObject({
      assetType: "image/png",
      assetUrl: expect.stringContaining("/asset?"),
    });
  });
  it("handles aborted or failed requests and unavailable status refreshes", async () => {
    const { model, api } = setup();
    await model.start();
    vi.mocked(api.document).mockRejectedValueOnce(new DOMException("cancelled", "AbortError"));
    await model.selectNote("Second.md");
    expect(model.getSnapshot().error).toBeNull();
    vi.mocked(api.document).mockRejectedValueOnce(new Error("internal details"));
    vi.mocked(api.session).mockRejectedValueOnce(new Error("offline"));
    await model.selectNote("Third.md");
    expect(model.getSnapshot().error?.message).not.toContain("internal details");
    vi.mocked(api.sync).mockRejectedValueOnce(new ApiError("github_permission", "No access"));
    await model.selectRepository(102);
    expect(model.getSnapshot().reading?.path).toBe("README.md");
    const late = deferred<Snapshot>();
    vi.mocked(api.sync).mockReturnValueOnce(late.promise);
    const old = model.selectRepository(102);
    await model.selectRepository(101);
    late.resolve(snapshot(102));
    await old;
    expect(model.getSnapshot().snapshot?.repository.id).toBe(101);
    const fail = deferred<Snapshot>();
    vi.mocked(api.sync).mockReturnValueOnce(fail.promise);
    const oldFailure = model.selectRepository(102);
    await model.selectRepository(101);
    fail.reject(new Error("stale"));
    await oldFailure;
    expect(model.getSnapshot().error).toBeNull();
  });
  it("previews note embeds from the pinned version without recursively loading them", async () => {
    const { model, api } = setup();
    vi.mocked(api.document).mockResolvedValueOnce(
      document("README.md", "a", "# Garden\n\n![[Second]]\n![[README]]\n![[image.png]]\n"),
    );
    await model.start();
    expect(model.getSnapshot().reading?.embeds.Second).toMatchObject({
      loading: false,
      unavailable: false,
      title: "Second.md",
    });
    expect(model.getSnapshot().reading?.embeds.README.title).toBe("Garden");
    expect(api.document).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.document).mock.calls[1][1]).toBe(hash("a"));
  });
  it("keeps failed embed previews local and discards stale embed completion", async () => {
    const { model, api } = setup();
    vi.mocked(api.document)
      .mockResolvedValueOnce(document("README.md", "a", "# Garden\n\n![[Second]]"))
      .mockRejectedValueOnce(new ApiError("github_invalid", "Rotate"));
    await model.start();
    expect(model.getSnapshot().reading?.embeds.Second.unavailable).toBe(true);
    const late = deferred<DocumentContent>();
    vi.mocked(api.document)
      .mockResolvedValueOnce(document("Second.md", "a", "# Second\n![[Third]]"))
      .mockReturnValueOnce(late.promise);
    const reading = model.selectNote("Second.md");
    await vi.waitFor(() => expect(model.getSnapshot().reading?.embeds.Third.loading).toBe(true));
    await model.selectNote("README.md");
    late.resolve(document("Third.md"));
    await reading;
    expect(model.getSnapshot().reading?.path).toBe("README.md");
  });
});

describe("version handoff and connection recovery", () => {
  it("retains the directory and article when the server returns only unchanged metadata", async () => {
    const { model, api } = setup();
    await model.start();
    const before = model.getSnapshot();
    const repository = { ...snapshot().repository, checkedAt: 12345 };
    vi.mocked(api.sync).mockResolvedValueOnce({ unchanged: true, repository });
    await model.check(true);
    expect(api.sync).toHaveBeenLastCalledWith(101, true, before.snapshot?.treeSha);
    expect(model.getSnapshot().snapshot?.files).toBe(before.snapshot?.files);
    expect(model.getSnapshot().reading).toBe(before.reading);
    expect(model.getSnapshot().snapshot?.repository.checkedAt).toBe(12345);
    expect(model.getSnapshot()).toMatchObject({
      pending: null,
      checking: false,
      notice: "已经是最新版本",
    });
  });
  it("does not let an old check clear the new repository's active check", async () => {
    const { model, api } = setup();
    await model.start();
    const old = deferred<Snapshot>();
    const current = deferred<Snapshot>();
    vi.mocked(api.sync).mockReturnValueOnce(old.promise);
    const checkingOld = model.check();
    await model.selectRepository(102);
    vi.mocked(api.sync).mockReturnValueOnce(current.promise);
    const checkingCurrent = model.check();
    old.resolve(snapshot(101, "d"));
    await checkingOld;
    expect(model.getSnapshot().checking).toBe(true);
    expect(model.getSnapshot().pending).toBeNull();
    current.resolve(snapshot(102, "e"));
    await checkingCurrent;
    expect(model.getSnapshot().checking).toBe(false);
    expect(model.getSnapshot().pending?.repository.id).toBe(102);
  });
  it("announces updates, applies them explicitly and preserves reading position", async () => {
    const { model, api } = setup();
    await model.start();
    const next = snapshot(101, "d");
    next.files[0].sha = hash("e");
    next.files.push({ path: "New.md", sha: hash("f"), size: 20 });
    vi.mocked(api.sync).mockResolvedValue(next);
    await model.check(true);
    expect(model.getSnapshot().pending?.treeSha).toBe(hash("d"));
    expect(model.getSnapshot().reading?.treeSha).toBe(hash("a"));
    await model.applyUpdate();
    expect(model.getSnapshot().pending).toBeNull();
    expect(model.getSnapshot().reading?.treeSha).toBe(hash("d"));
    expect(model.getSnapshot().navigation.preserve).toBe(true);
    expect(model.getSnapshot().changes).toEqual({ "README.md": "modified", "New.md": "added" });
    await model.check(true);
    expect(model.getSnapshot().notice).toBe("已经是最新版本");
    await model.check();
    expect(model.getSnapshot().notice).toBe("已经是最新版本");
  });
  it("handles a deleted current note and an entirely empty new snapshot", async () => {
    const { model, api } = setup();
    await model.start();
    await model.selectNote("Second.md");
    vi.mocked(api.sync).mockResolvedValueOnce({
      ...snapshot(101, "d"),
      files: snapshot().files.filter((file) => file.path !== "Second.md"),
    });
    await model.check();
    await model.applyUpdate();
    expect(model.getSnapshot().reading?.path).toBe("README.md");
    expect(model.getSnapshot().navigation.preserve).toBe(false);
    vi.mocked(api.sync).mockResolvedValueOnce({ ...snapshot(101, "e"), files: [] });
    await model.check();
    await model.applyUpdate();
    expect(model.getSnapshot()).toMatchObject({ reading: null, pending: null });
  });
  it("coalesces checks and ignores results that belong to a previous navigation", async () => {
    const { model, api } = setup();
    await model.start();
    vi.mocked(api.sync).mockClear();
    const late = deferred<Snapshot>();
    vi.mocked(api.sync).mockReturnValueOnce(late.promise);
    const check = model.check(true);
    await model.check();
    expect(api.sync).toHaveBeenCalledOnce();
    await model.selectNote("Second.md");
    late.resolve(snapshot(101, "d"));
    await check;
    expect(model.getSnapshot().pending).toBeNull();
    expect(model.getSnapshot().checking).toBe(false);
    const rejected = deferred<Snapshot>();
    vi.mocked(api.sync).mockReturnValueOnce(rejected.promise);
    const old = model.check();
    await model.selectNote("Third.md");
    rejected.reject(new ApiError("github_offline", "old"));
    await old;
    expect(model.getSnapshot().error).toBeNull();
  });
  it("respects Retry-After across both periodic and manual requests", async () => {
    vi.useFakeTimers();
    const { model, api, session } = setup();
    await model.start();
    session.connection = { ...session.connection, status: "limited", retryAt: Date.now() + 30_000 };
    vi.mocked(api.sync).mockRejectedValueOnce(
      new ApiError("github_limited", "Wait", session.connection.retryAt),
    );
    await model.check();
    const count = vi.mocked(api.sync).mock.calls.length;
    await model.check(true);
    await model.recheckConnection();
    expect(api.sync).toHaveBeenCalledTimes(count);
    expect(api.checkConnection).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_001);
    session.connection.retryAt = 0;
    await model.recheckConnection();
    expect(api.checkConnection).toHaveBeenCalledOnce();
  });
  it("rechecks a rotated credential once and preserves the article on failure", async () => {
    const { model, api, session } = setup();
    await model.start();
    const check = deferred<Session["connection"]>();
    vi.mocked(api.checkConnection).mockReturnValueOnce(check.promise);
    const checking = model.recheckConnection();
    await model.recheckConnection();
    expect(api.checkConnection).toHaveBeenCalledOnce();
    check.resolve(session.connection);
    await checking;
    expect(model.getSnapshot().checkingConnection).toBe(false);
    session.connection.status = "invalid";
    vi.mocked(api.checkConnection).mockRejectedValueOnce(new ApiError("github_invalid", "Rotate"));
    await model.recheckConnection();
    expect(model.getSnapshot().session?.connection.status).toBe("invalid");
    expect(model.getSnapshot().reading?.path).toBe("README.md");
  });
});

describe("repository and reading preferences", () => {
  it("registers a late addition without replacing a more recent navigation", async () => {
    const { model, api, browser } = setup();
    await model.start();
    const added = deferred<Snapshot>();
    vi.mocked(api.add).mockReturnValueOnce(added.promise);
    const adding = model.addRepository("demo/third");
    await model.selectNote("Second.md");
    vi.mocked(api.repositories).mockResolvedValue([
      snapshot().repository,
      snapshot(103).repository,
    ]);
    added.resolve(snapshot(103));
    await adding;
    expect(model.getSnapshot().reading?.path).toBe("Second.md");
    expect(model.getSnapshot().repositories.map((repo) => repo.id)).toContain(103);
    expect(model.getSnapshot().adding).toBe(false);
    expect(browser.navigate).toHaveBeenLastCalledWith("/?repo=101&note=Second.md", false);
  });
  it("allows an in-flight note to finish when a repository addition fails", async () => {
    const { model, api } = setup();
    await model.start();
    const note = deferred<DocumentContent>();
    vi.mocked(api.document).mockReturnValueOnce(note.promise);
    const opening = model.selectNote("Second.md");
    const signal = vi.mocked(api.document).mock.calls.at(-1)?.[3];
    vi.mocked(api.add).mockRejectedValueOnce(new ApiError("repository_url", "Invalid"));
    await model.addRepository("bad");
    expect(signal?.aborted).toBe(false);
    note.resolve(document("Second.md"));
    await opening;
    expect(model.getSnapshot()).toMatchObject({ loading: false, reading: { path: "Second.md" } });
  });
  it("adds repositories, protects against duplicate submits and handles empty vaults", async () => {
    const { model, api } = setup();
    await model.start();
    model.setRepositoryInput("demo/new");
    const result = deferred<Snapshot>();
    vi.mocked(api.add).mockReturnValueOnce(result.promise);
    const adding = model.addRepository();
    await model.addRepository();
    expect(api.add).toHaveBeenCalledOnce();
    result.resolve(snapshot(103));
    await adding;
    expect(model.getSnapshot()).toMatchObject({
      adding: false,
      repositoryInput: "",
      snapshot: { repository: { id: 103 } },
    });
    vi.mocked(api.add).mockResolvedValueOnce({ ...snapshot(104), files: [] });
    await model.addRepository("demo/empty");
    expect(model.getSnapshot().reading).toBeNull();
    vi.mocked(api.add).mockRejectedValueOnce(new ApiError("repository_url", "Invalid URL"));
    await model.addRepository("bad");
    expect(model.getSnapshot().error?.code).toBe("repository_url");
  });
  it("removes only local registrations and moves to a remaining repository", async () => {
    const { model, api, browser } = setup();
    await model.start();
    vi.mocked(api.remove).mockRejectedValueOnce(new ApiError("network", "Offline"));
    await model.removeRepository(101);
    expect(model.getSnapshot().repositories).toHaveLength(2);
    const result = deferred<{ removed: boolean }>();
    vi.mocked(api.remove).mockReturnValueOnce(result.promise);
    const removing = model.removeRepository(101);
    await model.removeRepository(101);
    result.resolve({ removed: true });
    await removing;
    expect(api.remove).toHaveBeenCalledTimes(2);
    expect(model.getSnapshot().snapshot?.repository.id).toBe(102);
    await model.removeRepository(102);
    expect(model.getSnapshot().reading).toBeNull();
    expect(browser.navigate).toHaveBeenLastCalledWith("/", true);
  });
  it("can remove an inactive repository without disrupting the current reading", async () => {
    const { model } = setup();
    await model.start();
    await model.removeRepository(102);
    expect(model.getSnapshot().reading?.path).toBe("README.md");
  });
  it("bounds type size and offers copy confirmation without storing note content", async () => {
    const { model, browser } = setup();
    await model.start();
    model.setFontScale(99);
    expect(model.getSnapshot().fontScale).toBe(1.3);
    model.setFontScale(-3);
    expect(model.getSnapshot().fontScale).toBe(0.9);
    model.setFontScale(Number.NaN);
    expect(model.getSnapshot().fontScale).toBe(0.9);
    model.setFontScale(1.15);
    expect(browser.writeScale).toHaveBeenLastCalledWith(1.15);
    await model.copyLink();
    expect(browser.copy).toHaveBeenCalledWith("https://reader.test/?repo=101&note=README.md");
    expect(model.getSnapshot().notice).toBe("阅读链接已复制");
    vi.mocked(browser.copy).mockRejectedValueOnce(new Error("Permission denied"));
    await model.copyLink();
    expect(model.getSnapshot().error?.code).toBe("clipboard");
  });
  it("keeps scenario controls local and supports controlled failure paths", async () => {
    const { model, api } = setup();
    await model.start();
    model.openDialog("local");
    await vi.waitFor(() => expect(model.getSnapshot().local?.scenario).toBe("healthy"));
    await model.setScenario("expiring");
    expect(api.local).toHaveBeenLastCalledWith("expiring");
    expect(api.checkConnection).toHaveBeenCalledOnce();
    vi.mocked(api.local).mockRejectedValueOnce(new ApiError("local", "Unavailable"));
    await model.setScenario("offline");
    expect(model.getSnapshot().error?.code).toBe("local");
    vi.mocked(api.local).mockRejectedValueOnce(new ApiError("local", "Unavailable"));
    model.openDialog("local");
    await vi.waitFor(() => expect(model.getSnapshot().error?.code).toBe("local"));
    const remote = setup(false);
    await remote.model.start();
    remote.model.openDialog("local");
    await remote.model.setScenario("healthy");
    expect(remote.api.local).not.toHaveBeenCalled();
  });
  it("checks only while visible and releases listeners and timers on unmount", async () => {
    vi.useFakeTimers();
    const { model, api, browser } = setup();
    const stop = model.mount();
    await vi.advanceTimersByTimeAsync(0);
    const count = vi.mocked(api.sync).mock.calls.length;
    vi.mocked(browser.visible).mockReturnValue(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.sync).toHaveBeenCalledTimes(count);
    vi.mocked(browser.visible).mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.sync).toHaveBeenCalledTimes(count + 1);
    const callbacks = vi.mocked(browser.listen).mock.calls[0];
    callbacks[2]();
    expect(model.getSnapshot().dialog).toBe("search");
    callbacks[1]();
    await vi.advanceTimersByTimeAsync(0);
    vi.mocked(browser.route).mockReturnValue({ repository: 101, path: "Second.md", anchor: "" });
    callbacks[0]();
    await vi.advanceTimersByTimeAsync(0);
    expect(model.getSnapshot().reading?.path).toBe("Second.md");
    stop();
    const stopped = vi.mocked(api.sync).mock.calls.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(api.sync).toHaveBeenCalledTimes(stopped);
    expect(vi.mocked(browser.listen).mock.results[0].value).toHaveBeenCalledOnce();
  });
});
