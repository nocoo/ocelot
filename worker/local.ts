import { localControls, mockGitHub } from "../mock/github";
import { handleApi } from "./app";
import type { Bindings } from "./github";
import { failure, HttpError, securityHeaders } from "./http";
import { cleanup } from "./store";

export default {
  async fetch(request: Request, env: Bindings) {
    try {
      const url = new URL(request.url);
      if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
        throw new HttpError(403, "local_only", "本地阅读器仅接受本机连接。");
      // Wrangler rewrites the request's port. Restore only the two known local
      // Vite origins before the shared CSRF check; production never imports this entry.
      const origin = request.headers.get("Origin");
      if (origin && /^http:\/\/(127\.0\.0\.1|localhost):(5173|5174)$/u.test(origin)) {
        request = new Request(`${origin}${url.pathname}${url.search}`, request);
      }
      const response =
        url.pathname === "/api/local"
          ? await localControls(request, env)
          : await handleApi(request, env, "reader@ocelot.local", true, mockGitHub(env));
      return securityHeaders(response);
    } catch (error) {
      return securityHeaders(failure(error));
    }
  },
  async scheduled(_controller, env) {
    await cleanup(env);
  },
} satisfies ExportedHandler<Bindings>;
