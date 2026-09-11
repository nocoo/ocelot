import type { ConnectionStatus, VaultFile } from "../src/models/contracts";
import { canonicalPath } from "../src/models/vault";
import { HttpError, readJson, readLimited } from "./http";

export type Bindings = Omit<WorkerBindings, "ASSETS">;
export type Transport = (request: Request) => Promise<Response>;
export const gitSha = /^[a-f0-9]{40}$/u;

export interface GitRepository {
  id: number;
  name: string;
  owner: { login: string };
  default_branch: string;
  private: boolean;
  description: string | null;
}

interface GitTree {
  sha: string;
  truncated: boolean;
  tree: { path: string; sha: string; type: string; mode: string; size?: number }[];
}

export function expiration(value: string | null): string | null {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

export function retryTime(headers: Headers, now: number): number {
  const retry = headers.get("Retry-After");
  const seconds = Number(retry);
  const date = retry ? Date.parse(retry) : Number.NaN;
  const reset = Number(headers.get("X-RateLimit-Reset")) * 1000;
  return Math.max(
    now + 1000,
    retry
      ? Number.isFinite(seconds)
        ? now + seconds * 1000
        : Number.isFinite(date)
          ? date
          : now + 60_000
      : reset || now + 60_000,
  );
}

export class GitHub {
  constructor(
    private env: Bindings,
    private transport: Transport = fetch.bind(globalThis),
  ) {}

  private async record(
    status: ConnectionStatus,
    started: number,
    expiresAt: string | null,
    retryAt = 0,
  ): Promise<void> {
    await this.env.DB.prepare(
      "UPDATE connection SET status = ?, checked_at = ?, expires_at = ?, retry_at = ? WHERE id = 1 AND checked_at <= ?",
    )
      .bind(status, started, expiresAt, retryAt, started)
      .run();
    if (status === "invalid") {
      await this.env.DB.prepare(
        "UPDATE repositories SET authorized_at = 0, authorization = 'invalid'",
      ).run();
    }
  }

  async request(path: string, headers: HeadersInit = {}): Promise<Response> {
    const started = Date.now();
    const connection = await this.env.DB.prepare(
      "SELECT retry_at FROM connection WHERE id = 1",
    ).first<{ retry_at: number }>();
    if (connection && connection.retry_at > started)
      throw new HttpError(
        429,
        "github_limited",
        "GitHub 正在限流，我们会在稍后继续检查。",
        connection.retry_at,
      );
    if (!this.env.GITHUB_TOKEN) {
      await this.record("invalid", started, null);
      throw new HttpError(424, "github_invalid", "连接需要更新，请轮换服务端 GitHub 凭据。");
    }
    const requestHeaders = new Headers(headers);
    requestHeaders.set("Authorization", `Bearer ${this.env.GITHUB_TOKEN}`);
    requestHeaders.set("User-Agent", "Ocelot-Reader");
    requestHeaders.set("X-GitHub-Api-Version", "2022-11-28");
    if (!requestHeaders.has("Accept")) requestHeaders.set("Accept", "application/vnd.github+json");
    let response: Response;
    try {
      response = await this.transport(
        new Request(`https://api.github.com${path}`, {
          headers: requestHeaders,
          redirect: "manual",
          signal: AbortSignal.timeout(12_000),
        }),
      );
    } catch {
      await this.record("offline", started, expiration(this.env.GITHUB_TOKEN_EXPIRES_AT));
      throw new HttpError(503, "github_offline", "暂时无法连接 GitHub。已打开的文章可以继续阅读。");
    }
    const expiresAt =
      expiration(response.headers.get("github-authentication-token-expiration")) ??
      expiration(this.env.GITHUB_TOKEN_EXPIRES_AT);
    if (
      response.status === 429 ||
      (response.status === 403 &&
        (response.headers.has("Retry-After") ||
          response.headers.get("X-RateLimit-Remaining") === "0"))
    ) {
      const retryAt = retryTime(response.headers, started);
      await response.body?.cancel();
      await this.record("limited", started, expiresAt, retryAt);
      throw new HttpError(
        429,
        "github_limited",
        "GitHub 正在限流，我们会在稍后继续检查。",
        retryAt,
      );
    }
    if (response.status === 401) {
      await response.body?.cancel();
      await this.record("invalid", started, expiresAt);
      throw new HttpError(424, "github_invalid", "连接需要更新，请轮换服务端 GitHub 凭据。");
    }
    if (response.status === 403 || response.status === 404) {
      await response.body?.cancel();
      throw new HttpError(
        403,
        "github_permission",
        "无法读取这个仓库，请检查仓库名称及 PAT 的只读访问权限。",
      );
    }
    if (!response.ok && response.status !== 304) {
      await response.body?.cancel();
      await this.record("offline", started, expiresAt);
      throw new HttpError(503, "github_offline", "GitHub 暂时不可用，请稍后重试。");
    }
    await this.record("healthy", started, expiresAt);
    return response;
  }

  async repository(path: string): Promise<GitRepository> {
    const repository = await readJson<GitRepository>(await this.request(path));
    if (
      !Number.isSafeInteger(repository.id) ||
      repository.id <= 0 ||
      !repository.owner?.login ||
      !repository.name ||
      !repository.default_branch ||
      typeof repository.private !== "boolean"
    ) {
      throw new HttpError(502, "github_response", "GitHub 返回的仓库信息不完整，请稍后重试。");
    }
    return repository;
  }

  async head(
    id: number,
    branch: string,
    etag: string | null,
  ): Promise<{ sha: string; tree: string; etag: string | null } | null> {
    const response = await this.request(
      `/repositories/${id}/commits/${encodeURIComponent(branch)}`,
      etag ? { "If-None-Match": etag } : {},
    );
    if (response.status === 304) return null;
    const commit = await readJson<{ sha: string; commit: { tree: { sha: string } } }>(response);
    if (!gitSha.test(commit.sha) || !gitSha.test(commit.commit?.tree?.sha))
      throw new HttpError(502, "github_response", "GitHub 返回的版本信息不完整，请稍后重试。");
    return { sha: commit.sha, tree: commit.commit.tree.sha, etag: response.headers.get("ETag") };
  }

  async tree(id: number, sha: string): Promise<VaultFile[]> {
    const read = async (treeSha: string, recursive: boolean) => {
      const data = await readJson<GitTree>(
        await this.request(
          `/repositories/${id}/git/trees/${treeSha}${recursive ? "?recursive=1" : ""}`,
        ),
        10_485_760,
      );
      if (data.sha !== treeSha || !Array.isArray(data.tree))
        throw new HttpError(502, "github_response", "GitHub 返回的目录信息不完整，请稍后重试。");
      return data;
    };
    let tree = await read(sha, true);
    const files: VaultFile[] = [];
    const append = (entries: GitTree["tree"], prefix: string) => {
      for (const entry of entries) {
        const path = `${prefix}${entry.path}`;
        if (
          entry.type === "blob" &&
          (entry.mode === "100644" || entry.mode === "100755") &&
          canonicalPath(path) &&
          gitSha.test(entry.sha)
        ) {
          files.push({ path, sha: entry.sha, size: entry.size ?? 0 });
        }
      }
    };
    if (!tree.truncated) append(tree.tree, "");
    else {
      const queue = [{ sha, prefix: "" }];
      const deadline = Date.now() + 60_000;
      for (let index = 0; index < queue.length; index++) {
        if (index >= 256 || Date.now() > deadline || files.length > 20_000)
          throw new HttpError(
            422,
            "tree_too_large",
            "这个目录超出了当前阅读器的容量，请选择较小的知识库。",
          );
        const item = queue[index];
        tree = await read(item.sha, false);
        if (tree.truncated)
          throw new HttpError(422, "tree_truncated", "GitHub 未能返回完整目录，请稍后重试。");
        append(tree.tree, item.prefix);
        for (const entry of tree.tree) {
          const path = `${item.prefix}${entry.path}`;
          if (entry.type === "tree" && canonicalPath(path) && gitSha.test(entry.sha))
            queue.push({ sha: entry.sha, prefix: `${path}/` });
        }
      }
    }
    if (files.length > 20_000)
      throw new HttpError(
        422,
        "tree_too_large",
        "这个目录超出了当前阅读器的容量，请选择较小的知识库。",
      );
    return files.sort((a, b) => a.path.localeCompare(b.path, "en"));
  }

  async blob(id: number, sha: string, limit: number): Promise<Uint8Array<ArrayBuffer>> {
    const response = await this.request(`/repositories/${id}/git/blobs/${sha}`, {
      Accept: "application/vnd.github.raw+json",
    });
    return readLimited(response, limit);
  }
}
