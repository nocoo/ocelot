import { type Bindings, GitHub, type Transport } from "./github";
import { HttpError, json, readJson, requireSameOrigin } from "./http";
import { connection, VaultStore } from "./store";

export async function handleApi(
  request: Request,
  env: Bindings,
  email: string,
  local = false,
  transport?: Transport,
): Promise<Response> {
  requireSameOrigin(request);
  const url = new URL(request.url);
  const github = new GitHub(env, transport);
  const store = new VaultStore(env, github);
  if (url.pathname === "/api/session" && request.method === "GET")
    return json({ email, local, connection: await connection(env) });
  if (url.pathname === "/api/connection/check" && request.method === "POST") {
    const response = await github.request("/user");
    await response.body?.cancel();
    await env.DB.prepare("UPDATE repositories SET authorized_at = 0").run();
    return json(await connection(env));
  }
  if (url.pathname === "/api/repositories") {
    if (request.method === "GET") return json(await store.repositories());
    if (request.method === "POST") {
      let body: { repository?: unknown };
      try {
        body = await readJson(request, 2048);
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(400, "input_invalid", "请输入有效的 GitHub 仓库地址。");
      }
      if (!body || typeof body.repository !== "string")
        throw new HttpError(400, "input_invalid", "请输入有效的 GitHub 仓库地址。");
      return json(await store.add(body.repository), 201);
    }
  }
  const match = url.pathname.match(
    /^\/api\/repositories\/([1-9]\d{0,15})(?:\/(snapshot|sync|document|asset))?$/u,
  );
  if (match && Number.isSafeInteger(Number(match[1]))) {
    const id = Number(match[1]);
    const action = match[2];
    if (!action && request.method === "DELETE") {
      await store.remove(id);
      return json({ removed: true });
    }
    if (action === "sync" && request.method === "POST") {
      const snapshot = await store.sync(id, url.searchParams.get("force") === "1");
      return json(
        url.searchParams.get("known") === snapshot.treeSha
          ? { unchanged: true, repository: snapshot.repository }
          : snapshot,
      );
    }
    if (action === "snapshot" && request.method === "GET")
      return json(await store.snapshot(id, url.searchParams.get("tree") ?? undefined));
    if ((action === "document" || action === "asset") && request.method === "GET")
      return store.content(
        id,
        url.searchParams.get("tree") ?? "",
        url.searchParams.get("path") ?? "",
        action === "asset",
      );
  }
  throw new HttpError(404, "route_missing", "找不到这个页面。");
}
