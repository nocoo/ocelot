import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { version } from "../package.json";
import { assertDeploymentTag, deploymentVersion } from "./release-model.ts";

process.chdir(resolve(import.meta.dirname, ".."));
const revision =
  process.argv[2] ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (!/^[a-f0-9]{40}$/u.test(revision)) throw new Error("Expected a full Git revision.");
function wranglerJson(...args: string[]): unknown {
  return JSON.parse(
    execFileSync("bun", ["x", "wrangler", ...args, "--json"], { encoding: "utf8" }),
  );
}
const id = deploymentVersion(wranglerJson("deployments", "status"));
assertDeploymentTag(wranglerJson("versions", "view", id), `v${version}-${revision}`);
const response = await fetch("https://ocelot.hexly.ai/", {
  redirect: "manual",
  signal: AbortSignal.timeout(15_000),
});
await response.body?.cancel();
const login = new URL(response.headers.get("Location") ?? "/", "https://ocelot.hexly.ai");
if (
  ![302, 303, 307].includes(response.status) ||
  login.origin !== "https://nocoo.cloudflareaccess.com" ||
  !login.pathname.startsWith("/cdn-cgi/access/login")
)
  throw new Error(
    "The production domain must redirect anonymous readers to nocoo Cloudflare Access.",
  );
console.info(
  `Verified Ocelot v${version}, Git ${revision}, Worker ${id}, and the Access login boundary.`,
);
