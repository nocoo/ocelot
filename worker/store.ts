import type {
  Connection,
  ConnectionStatus,
  Repository,
  Snapshot,
  VaultFile,
} from "../src/models/contracts";
import { attachmentType, canonicalPath, isMarkdown, parseRepository } from "../src/models/vault";
import { type Bindings, type GitHub, gitSha } from "./github";
import { HttpError } from "./http";

export interface RepositoryRow {
  id: number;
  owner: string;
  name: string;
  branch: string;
  private: number;
  description: string;
  commit_sha: string | null;
  tree_sha: string | null;
  etag: string | null;
  checked_at: number;
  authorized_at: number;
  authorization: string;
  retry_at: number;
}

export function publicRepository(row: RepositoryRow): Repository {
  return {
    id: row.id,
    owner: row.owner,
    name: row.name,
    branch: row.branch,
    private: Boolean(row.private),
    description: row.description,
    commitSha: row.commit_sha,
    treeSha: row.tree_sha,
    checkedAt: row.checked_at,
    authorization: row.authorization,
  };
}

export async function connection(env: Bindings): Promise<Connection> {
  const row = await env.DB.prepare("SELECT * FROM connection WHERE id = 1").first<{
    status: ConnectionStatus;
    expires_at: string | null;
    checked_at: number;
    retry_at: number;
  }>();
  if (!row) throw new HttpError(503, "database_setup", "阅读器尚未完成初始化。");
  return {
    status: row.status,
    expiresAt: row.expires_at,
    checkedAt: row.checked_at,
    retryAt: row.retry_at,
  };
}

export class VaultStore {
  constructor(
    private env: Bindings,
    private github: GitHub,
  ) {}

  async repositories(): Promise<Repository[]> {
    const { results } = await this.env.DB.prepare(
      "SELECT * FROM repositories ORDER BY added_at, id",
    ).all<RepositoryRow>();
    return results.map(publicRepository);
  }

  async repository(id: number): Promise<RepositoryRow> {
    const repository = await this.env.DB.prepare("SELECT * FROM repositories WHERE id = ?")
      .bind(id)
      .first<RepositoryRow>();
    if (!repository)
      throw new HttpError(404, "repository_missing", "这个知识库已被移除，请选择另一个。");
    return repository;
  }

  async add(input: string): Promise<Snapshot> {
    const parsed = parseRepository(input);
    if (!parsed)
      throw new HttpError(400, "repository_url", "请输入 GitHub 仓库地址或 owner/repository。");
    const repo = await this.github.repository(
      `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.name)}`,
    );
    await this.env.DB.prepare(
      "INSERT INTO repositories (id, owner, name, branch, private, description, added_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
    )
      .bind(
        repo.id,
        repo.owner.login,
        repo.name,
        repo.default_branch,
        Number(repo.private),
        repo.description ?? "",
        Date.now(),
      )
      .run();
    return this.sync(repo.id, true);
  }

  private async rejectAccess(id: number, error: unknown): Promise<never> {
    if (
      error instanceof HttpError &&
      (error.code === "github_permission" || error.code === "github_invalid")
    ) {
      await this.env.DB.prepare(
        "UPDATE repositories SET authorized_at = 0, authorization = 'denied' WHERE id = ?",
      )
        .bind(id)
        .run();
    }
    throw error;
  }

  async authorize(row: RepositoryRow): Promise<RepositoryRow> {
    const state = await connection(this.env);
    if (state.status === "invalid")
      throw new HttpError(424, "github_invalid", "连接需要更新，请轮换服务端 GitHub 凭据。");
    if (row.authorization === "allowed" && Date.now() - row.authorized_at < 60_000) return row;
    try {
      const repo = await this.github.repository(`/repositories/${row.id}`);
      if (repo.id !== row.id)
        throw new HttpError(403, "github_permission", "仓库身份发生了变化，请重新添加。");
      await this.env.DB.prepare(
        "UPDATE repositories SET owner = ?, name = ?, private = ?, authorized_at = ?, authorization = 'allowed' WHERE id = ?",
      )
        .bind(repo.owner.login, repo.name, Number(repo.private), Date.now(), row.id)
        .run();
      return this.repository(row.id);
    } catch (error) {
      return this.rejectAccess(row.id, error);
    }
  }

  private treeKey(id: number, sha: string): string {
    return `repos/${id}/trees/${sha}.json`;
  }

  private async files(id: number, sha: string): Promise<VaultFile[]> {
    const key = this.treeKey(id, sha);
    const cached = await this.env.CACHE.get(key);
    if (cached) return cached.json<VaultFile[]>();
    const files = await this.github.tree(id, sha);
    await this.env.CACHE.put(key, JSON.stringify(files), {
      httpMetadata: { contentType: "application/json" },
    });
    return files;
  }

  async snapshot(id: number, treeSha?: string): Promise<Snapshot> {
    const row = await this.authorize(await this.repository(id));
    const tree = treeSha ?? row.tree_sha;
    if (!tree) return this.sync(id, true);
    if (!gitSha.test(tree)) throw new HttpError(400, "snapshot_invalid", "这个阅读版本无效。");
    const snapshot = await this.env.DB.prepare(
      "SELECT commit_sha FROM snapshots WHERE repository_id = ? AND tree_sha = ?",
    )
      .bind(id, tree)
      .first<{ commit_sha: string }>();
    if (!snapshot)
      throw new HttpError(410, "snapshot_expired", "这个阅读版本已过期，请检查更新后重新打开。");
    try {
      const files = await this.files(id, tree);
      return {
        repository: publicRepository(row),
        treeSha: tree,
        commitSha: snapshot.commit_sha,
        files,
      };
    } catch (error) {
      return this.rejectAccess(id, error);
    }
  }

  async sync(id: number, force = false): Promise<Snapshot> {
    let row = await this.repository(id);
    if (!force && row.tree_sha && Date.now() - row.checked_at < 60_000) return this.snapshot(id);
    const lease = crypto.randomUUID();
    const locked = await this.env.DB.prepare(
      "UPDATE repositories SET lease = ?, lease_until = ? WHERE id = ? AND lease_until <= ?",
    )
      .bind(lease, Date.now() + 120_000, id, Date.now())
      .run();
    if (!locked.meta.changes)
      throw new HttpError(409, "sync_busy", "正在检查这个知识库，请稍候。", Date.now() + 2000);
    try {
      row = await this.authorize(row);
      const head = await this.github.head(id, row.branch, row.etag);
      const tree = head?.tree ?? row.tree_sha;
      const commit = head?.sha ?? row.commit_sha;
      if (!tree || !commit)
        throw new HttpError(502, "github_response", "还没有可供阅读的版本，请稍后重试。");
      const files = await this.files(id, tree);
      const now = Date.now();
      const results = await this.env.DB.batch([
        this.env.DB.prepare(
          "INSERT INTO snapshots (repository_id, tree_sha, commit_sha, created_at) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM repositories WHERE id = ? AND lease = ?) ON CONFLICT(repository_id, tree_sha) DO UPDATE SET created_at = excluded.created_at",
        ).bind(id, tree, commit, now, id, lease),
        this.env.DB.prepare(
          "UPDATE repositories SET commit_sha = ?, tree_sha = ?, etag = ?, checked_at = ?, authorized_at = ?, authorization = 'allowed', retry_at = 0, lease = NULL, lease_until = 0 WHERE id = ? AND lease = ?",
        ).bind(commit, tree, head ? head.etag : row.etag, now, now, id, lease),
      ]);
      if (!results[1].meta.changes)
        throw new HttpError(409, "sync_superseded", "另一项检查已经完成，请重新加载目录。");
      row = await this.repository(id);
      return { repository: publicRepository(row), treeSha: tree, commitSha: commit, files };
    } catch (error) {
      return await this.rejectAccess(id, error);
    } finally {
      await this.env.DB.prepare(
        "UPDATE repositories SET lease = NULL, lease_until = 0 WHERE id = ? AND lease = ?",
      )
        .bind(id, lease)
        .run();
    }
  }

  async content(id: number, tree: string, path: string, asset: boolean): Promise<Response> {
    if (!canonicalPath(path) || !gitSha.test(tree))
      throw new HttpError(400, "path_invalid", "这个文件路径无效。");
    const snapshot = await this.snapshot(id, tree);
    const file = snapshot.files.find((entry) => entry.path === path);
    if (!file) throw new HttpError(404, "file_missing", "当前版本中找不到这份文件。");
    const type = asset
      ? attachmentType(path)
      : isMarkdown(path)
        ? "text/markdown; charset=utf-8"
        : null;
    if (!type) throw new HttpError(415, "file_unsupported", "阅读器暂不支持这个文件格式。");
    const limit = asset ? 15_728_640 : 2_097_152;
    if (file.size > limit)
      throw new HttpError(413, "too_large", "这个文件超过了阅读器的大小限制。");
    const key = `repos/${id}/blobs/${file.sha}`;
    let object = await this.env.CACHE.get(key);
    if (!object) {
      try {
        const bytes = await this.github.blob(id, file.sha, limit);
        if (
          new TextDecoder()
            .decode(bytes.subarray(0, 200))
            .startsWith("version https://git-lfs.github.com/spec/v1")
        )
          throw new HttpError(415, "git_lfs", "这个附件保存在 Git LFS 中，暂不支持在线预览。");
        await this.env.CACHE.put(key, bytes);
        object = await this.env.CACHE.get(key);
      } catch (error) {
        return this.rejectAccess(id, error);
      }
    }
    if (!object) throw new HttpError(503, "cache_unavailable", "文件正在准备中，请再试一次。");
    if (!asset)
      return Response.json(
        { path, sha: file.sha, treeSha: tree, content: await object.text() },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    const headers = new Headers({
      "Content-Type": type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    // PDFs download instead of executing an embedded viewer in the application's origin.
    if (type === "application/pdf")
      headers.set(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(path.split("/").at(-1) ?? "document.pdf")}`,
      );
    return new Response(object.body, { headers });
  }

  async remove(id: number): Promise<void> {
    await this.repository(id);
    await this.env.DB.prepare("DELETE FROM repositories WHERE id = ?").bind(id).run();
    await deleteCached(this.env.CACHE, `repos/${id}/`);
  }
}

export async function deleteCached(
  bucket: R2Bucket,
  prefix: string,
  before = Number.POSITIVE_INFINITY,
): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 500 });
    const keys = page.objects
      .filter((object) => object.uploaded.getTime() < before)
      .map((object) => object.key);
    if (keys.length) await bucket.delete(keys);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

export async function cleanup(env: Bindings): Promise<void> {
  const cutoff = Date.now() - 30 * 86_400_000;
  await env.DB.prepare(
    "DELETE FROM snapshots WHERE created_at < ? AND NOT EXISTS (SELECT 1 FROM repositories WHERE repositories.id = snapshots.repository_id AND repositories.tree_sha = snapshots.tree_sha)",
  )
    .bind(cutoff)
    .run();
  await deleteCached(env.CACHE, "repos/", cutoff);
}
