import { applyD1Migrations, reset } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach } from "vitest";

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: import("@cloudflare/vitest-plugin").D1Migration[];
    }
  }
}

beforeEach(async () => {
  await reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE mock_state (id INTEGER PRIMARY KEY, scenario TEXT NOT NULL)"),
    env.DB.prepare(
      "CREATE TABLE mock_requests (kind TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0)",
    ),
    env.DB.prepare("INSERT INTO mock_state VALUES (1, 'healthy')"),
  ]);
});
