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
      // The proxies change Host/port. Restore only the registered local origins
      // before the shared CSRF check; production never imports this entry.
      const origin = request.headers.get("Origin");
      if (
        origin &&
        (origin === "https://ocelot.dev.hexly.ai" ||
          /^http:\/\/(127\.0\.0\.1|localhost):(7049|27049)$/u.test(origin))
      ) {
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
