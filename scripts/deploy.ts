import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { version } from "../package.json";

process.chdir(resolve(import.meta.dirname, ".."));
const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
if (!config.vars.OWNER_EMAIL.includes("@"))
  throw new Error("Configure the single Access OWNER_EMAIL before deploying.");
if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_ACCOUNT_ID !== config.account_id)
  throw new Error("CLOUDFLARE_ACCOUNT_ID must match wrangler.jsonc.");
const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const databases: { name: string }[] = JSON.parse(
  execFileSync("bun", ["x", "wrangler", "d1", "list", "--json"], { encoding: "utf8" }),
);
function wrangler(...args: string[]) {
  execFileSync("bun", ["x", "wrangler", ...args], { stdio: "inherit" });
}
if (!databases.some((database) => database.name === "ocelot"))
  wrangler("d1", "create", "ocelot", "--location", "apac", "--update-config=false");
// Name lookup is supported by pinned Wrangler; migrate before any new code receives traffic.
wrangler("d1", "migrations", "apply", "ocelot", "--remote");
wrangler(
  "deploy",
  "--tag",
  `v${version}-${revision}`,
  "--message",
  `Ocelot v${version} (${revision})`,
);
execFileSync("bun", ["scripts/verify-deployment.ts", revision], { stdio: "inherit" });
