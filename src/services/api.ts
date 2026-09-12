import type {
  ApiFailure,
  AuthorProfile,
  Connection,
  DocumentContent,
  RecentNote,
  RecentPage,
  Repository,
  Scenario,
  Session,
  Snapshot,
  SyncResult,
} from "../models/contracts";
import { contentUrl } from "../models/vault";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryAt?: number,
  ) {
    super(message);
  }
}

interface RecentRequest {
  controller: AbortController;
  promise: Promise<RecentNote[]>;
  items?: RecentNote[];
}

export class ApiClient {
  private recentCache = new Map<string, RecentRequest>();

  constructor(private transport: typeof fetch = fetch.bind(globalThis)) {}

  async request<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
    let response: Response;
    try {
      response = await this.transport(path, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: { "Content-Type": "application/json", "X-Ocelot-Request": "1" },
        credentials: "same-origin",
        cache: "no-store",
        signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new ApiError("network", "暂时无法连接阅读器，请检查网络后重试。");
    }
    let data: T & { error?: ApiFailure };
    try {
      data = await response.json();
    } catch {
      throw new ApiError("access_required", "登录可能已到期，请刷新页面以重新登录。");
    }
    if (!response.ok)
      throw new ApiError(
        data.error?.code ?? "request",
        data.error?.message ?? "暂时无法完成请求，请稍后重试。",
        data.error?.retryAt,
      );
    return data;
  }

  session(): Promise<Session> {
    return this.request("/api/session");
  }
  profile(signal?: AbortSignal): Promise<AuthorProfile> {
    return this.request("/api/profile", "GET", undefined, signal);
  }
  repositories(): Promise<Repository[]> {
    return this.request("/api/repositories");
  }
  add(repository: string): Promise<Snapshot> {
    return this.request("/api/repositories", "POST", { repository });
  }
  remove(id: number): Promise<{ removed: boolean }> {
    return this.request(`/api/repositories/${id}`, "DELETE");
  }
  sync(id: number, force?: boolean): Promise<Snapshot>;
  sync(id: number, force: boolean, known: string, knownCommit?: string): Promise<SyncResult>;
  sync(id: number, force = false, known?: string, knownCommit?: string): Promise<SyncResult> {
    const query = new URLSearchParams();
    if (force) query.set("force", "1");
    if (known) query.set("known", known);
    if (knownCommit) query.set("knownCommit", knownCommit);
    return this.request(`/api/repositories/${id}/sync${query.size ? `?${query}` : ""}`, "POST");
  }
  recent(id: number, commit: string, cursor: number, signal?: AbortSignal): Promise<RecentPage> {
    const query = new URLSearchParams({ commit, cursor: String(cursor) });
    return this.request(`/api/repositories/${id}/recent?${query}`, "GET", undefined, signal);
  }

  cachedRecent(id: number, commit: string): RecentNote[] | undefined {
    return this.recentCache.get(`${id}/${commit}`)?.items;
  }

  recentNotes(id: number, commit: string): Promise<RecentNote[]> {
    const key = `${id}/${commit}`;
    const cached = this.recentCache.get(key);
    if (cached) return cached.promise;
    const controller = new AbortController();
    const entry: RecentRequest = {
      controller,
      promise: this.readRecent(id, commit, controller.signal).then(
        (items) => {
          entry.items = items;
          return items;
        },
        (error: unknown) => {
          if (this.recentCache.get(key) === entry) this.recentCache.delete(key);
          throw error;
        },
      ),
    };
    this.recentCache.set(key, entry);
    return entry.promise;
  }

  private async readRecent(id: number, commit: string, signal: AbortSignal): Promise<RecentNote[]> {
    let cursor = 0;
    while (true) {
      const page = await this.recent(id, commit, cursor, signal);
      signal.throwIfAborted();
      if (
        page.commitSha !== commit ||
        (page.next !== null &&
          (!Number.isSafeInteger(page.next) || page.next <= cursor || page.next > 20_000))
      )
        throw new ApiError("recent_invalid", "最近更新列表暂时不可用，请重试。");
      if (page.next === null) return page.items;
      cursor = page.next;
    }
  }

  clearRecent(id?: number): void {
    for (const [key, entry] of this.recentCache) {
      if (id !== undefined && !key.startsWith(`${id}/`)) continue;
      entry.controller.abort();
      this.recentCache.delete(key);
    }
  }

  document(id: number, tree: string, path: string, signal?: AbortSignal): Promise<DocumentContent> {
    return this.request(contentUrl(id, tree, path), "GET", undefined, signal);
  }
  checkConnection(): Promise<Connection> {
    return this.request("/api/connection/check", "POST");
  }
  local(
    scenario?: Scenario,
  ): Promise<{ scenario: Scenario; requests: Record<string, number>; repositories: string[] }> {
    return this.request(
      "/api/local",
      scenario ? "POST" : "GET",
      scenario ? { scenario } : undefined,
    );
  }
}
