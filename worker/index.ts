import { handleApi } from "./app";
import { verifyAccess } from "./auth";
import { failure, securityHeaders } from "./http";
import { cleanup } from "./store";

export default {
  async fetch(request: Request, env: WorkerBindings) {
    try {
      const email = await verifyAccess(request, env);
      const response = new URL(request.url).pathname.startsWith("/api/")
        ? await handleApi(request, env, email)
        : await env.ASSETS.fetch(request);
      return securityHeaders(response);
    } catch (error) {
      return securityHeaders(failure(error));
    }
  },
  async scheduled(_controller, env) {
    await cleanup(env);
  },
} satisfies ExportedHandler<WorkerBindings>;
