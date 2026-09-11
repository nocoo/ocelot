import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as pause } from "node:timers/promises";

const test = process.argv.includes("--test");
const persist = test ? ".wrangler/e2e" : ".wrangler/state";
const workerPort = test ? "8788" : "8787";
const webPort = test ? "5174" : "5173";
const environment = {
  ...process.env,
  WRANGLER_SEND_METRICS: "false",
  OCELOT_WORKER_PORT: workerPort,
  OCELOT_WEB_PORT: webPort,
};
const config = ["--local", "--config", "wrangler.local.jsonc", "--persist-to", persist];
if (test) rmSync(persist, { recursive: true, force: true });
for (const args of [
  ["d1", "migrations", "apply", "ocelot-local", ...config],
  ["d1", "execute", "ocelot-local", ...config, "--file", "fixtures/seed.sql"],
]) {
  const result = spawnSync("bun", ["x", "wrangler", ...args], {
    stdio: "inherit",
    env: environment,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
function launch(args) {
  const child = spawn("bun", args, { stdio: "inherit", env: environment });
  children.push(child);
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => stop(code ?? 0));
}
launch(["x", "wrangler", "dev", ...config, "--ip", "127.0.0.1", "--port", workerPort]);
const deadline = Date.now() + 30_000;
while (!stopping) {
  let ready = false;
  try {
    const response = await fetch(`http://127.0.0.1:${workerPort}/api/session`, {
      signal: AbortSignal.timeout(1000),
    });
    ready = response.ok;
    await response.body?.cancel();
  } catch {
    /* Wrangler is still starting. */
  }
  if (stopping) break;
  if (ready) {
    launch(["x", "vite", ...(test ? ["preview"] : []), "--host", "127.0.0.1", "--port", webPort]);
    break;
  }
  if (Date.now() >= deadline) {
    console.error("Local Worker did not become ready within 30 seconds.");
    stop(1);
    break;
  }
  await pause(150);
}
