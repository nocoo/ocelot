import type {
  ApiFailure,
  AuthorProfile,
  Connection,
  DocumentContent,
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

export class ApiClient {
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
  sync(id: number, force: boolean, known: string): Promise<SyncResult>;
  sync(id: number, force = false, known?: string): Promise<SyncResult> {
    const query = new URLSearchParams();
    if (force) query.set("force", "1");
    if (known) query.set("known", known);
    return this.request(`/api/repositories/${id}/sync${query.size ? `?${query}` : ""}`, "POST");
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
