import data from "../fixtures/generated/github.json";
import { type Scenario, scenarios } from "../src/models/contracts";
import type { Bindings, Transport } from "../worker/github";
import { HttpError, json, readJson, requireSameOrigin } from "../worker/http";

const blobs: Record<string, string> = data.blobs;

export async function scenario(env: Bindings): Promise<Scenario> {
  const row = await env.DB.prepare("SELECT scenario FROM mock_state WHERE id = 1").first<{
    scenario: Scenario;
  }>();
  return row?.scenario ?? "healthy";
}

export function mockGitHub(env: Bindings): Transport {
  return async (request) => {
    const state = await scenario(env);
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname);
    const kind =
      path === "/graphql"
        ? "history"
        : path.includes("/git/blobs/")
          ? "blob"
          : path.includes("/git/trees/")
            ? "tree"
            : path.includes("/commits/")
              ? "head"
              : path === "/user"
                ? "user"
                : "repository";
    await env.DB.prepare(
      "INSERT INTO mock_requests (kind, count) VALUES (?, 1) ON CONFLICT(kind) DO UPDATE SET count = count + 1",
    )
      .bind(kind)
      .run();
    if (state === "slow")
      await new Promise((resolve) => setTimeout(resolve, kind === "blob" ? 1400 : 600));
    if (state === "offline") throw new TypeError("Synthetic offline scenario");
    if (
      state === "invalid" ||
      request.headers.get("Authorization") !== "Bearer synthetic-local-credential"
    )
      return json({ message: "Synthetic invalid credentials" }, 401);
    if (state === "limited")
      return new Response(null, {
        status: 403,
        headers: { "Retry-After": "30", "X-RateLimit-Remaining": "0" },
      });
    const headers = new Headers({
      "github-authentication-token-expiration": new Date(
        Date.now() + (state === "expiring" ? 3 : 60) * 86_400_000,
      ).toISOString(),
    });
    if (path === "/user") return Response.json({ login: "ocelot-demo" }, { headers });
    if (path === "/graphql") {
      const body = await readJson<{
        query: string;
        variables: { owner: string; name: string; commit: string };
      }>(request);
      const repository = data.repositories.find(
        (repo) => repo.owner.login === body.variables.owner && repo.name === body.variables.name,
      );
      const revision = repository?.revisions.find((item) => item.commit === body.variables.commit);
      const histories = [
        ...body.query.matchAll(/p(\d+): history\(first: 1, path: ("(?:[^"\\]|\\.)*")\)/gu),
      ].map((match) => {
        const path: string = JSON.parse(match[2]);
        const date = (revision?.history as Record<string, string> | undefined)?.[path];
        return [`p${match[1]}`, { nodes: date ? [{ committedDate: date }] : [] }];
      });
      return Response.json(
        {
          data: {
            repository: repository
              ? {
                  databaseId: repository.id,
                  object: revision
                    ? { oid: revision.commit, ...Object.fromEntries(histories) }
                    : null,
                }
              : null,
          },
        },
        { headers },
      );
    }
    const repository = data.repositories.find(
      (repo) =>
        path === `/repos/${repo.owner.login}/${repo.name}` ||
        path === `/repositories/${repo.id}` ||
        path.startsWith(`/repositories/${repo.id}/`),
    );
    if (!repository) return json({ message: "Synthetic repository not found" }, 404);
    if (
      path === `/repos/${repository.owner.login}/${repository.name}` ||
      path === `/repositories/${repository.id}`
    ) {
      const { revisions: _revisions, ...metadata } = repository;
      return Response.json(metadata, { headers });
    }
    const revision = repository.revisions[state === "updated" && repository.id === 101 ? 1 : 0];
    if (path === `/repositories/${repository.id}/commits/${repository.default_branch}`) {
      headers.set("ETag", `"${revision.commit}"`);
      if (request.headers.get("If-None-Match") === headers.get("ETag")) {
        await env.DB.prepare(
          "INSERT INTO mock_requests (kind, count) VALUES ('not-modified', 1) ON CONFLICT(kind) DO UPDATE SET count = count + 1",
        ).run();
        return new Response(null, { status: 304, headers });
      }
      return Response.json(
        { sha: revision.commit, commit: { tree: { sha: revision.tree } } },
        { headers },
      );
    }
    const tree = repository.revisions.find(
      (item) => path === `/repositories/${repository.id}/git/trees/${item.tree}`,
    );
    if (tree)
      return Response.json({ sha: tree.tree, truncated: false, tree: tree.files }, { headers });
    const sha = path.split("/git/blobs/")[1];
    if (
      sha &&
      blobs[sha] &&
      repository.revisions.some((item) => item.files.some((file) => file.sha === sha))
    ) {
      const bytes = Uint8Array.from(atob(blobs[sha]), (character) => character.charCodeAt(0));
      headers.set("Content-Length", String(bytes.length));
      return new Response(bytes, { headers });
    }
    return json({ message: "Synthetic object not found" }, 404);
  };
}

export async function localControls(request: Request, env: Bindings): Promise<Response> {
  requireSameOrigin(request);
  if (request.method === "POST") {
    let body: { scenario?: unknown };
    try {
      body = await readJson(request, 1024);
    } catch {
      throw new HttpError(400, "scenario_invalid", "请选择有效的本地场景。");
    }
    if (!body || !scenarios.includes(body.scenario as Scenario))
      throw new HttpError(400, "scenario_invalid", "请选择有效的本地场景。");
    await env.DB.batch([
      env.DB.prepare("UPDATE mock_state SET scenario = ? WHERE id = 1").bind(body.scenario),
      env.DB.prepare("UPDATE connection SET status = 'unknown', retry_at = 0, checked_at = 0"),
      env.DB.prepare(
        "UPDATE repositories SET authorized_at = 0, checked_at = 0, lease = NULL, lease_until = 0",
      ),
    ]);
  } else if (request.method !== "GET") throw new HttpError(405, "method", "不支持这个操作。");
  const requests = await env.DB.prepare("SELECT kind, count FROM mock_requests ORDER BY kind").all<{
    kind: string;
    count: number;
  }>();
  return json({
    scenario: await scenario(env),
    requests: Object.fromEntries(requests.results.map((row) => [row.kind, row.count])),
    repositories: data.repositories.map((repo) => `${repo.owner.login}/${repo.name}`),
  });
}
