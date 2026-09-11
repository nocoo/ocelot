import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { version } from "../package.json";
import { assertDeploymentTag, deploymentVersion, verifyAccessDomain } from "./release-model.ts";

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
await verifyAccessDomain();
console.info(
  `Verified Ocelot v${version}, Git ${revision}, Worker ${id}, and the Access login boundary.`,
);
