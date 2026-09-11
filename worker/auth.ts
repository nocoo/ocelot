import { createRemoteJWKSet, customFetch, type JWTVerifyGetKey, jwtVerify } from "jose";
import { HttpError, readLimited } from "./http";

export async function publicKeys(input: string, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  const cache = await caches.open("ocelot-public-access-keys");
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (!response.ok) return response;
  const body = await readLimited(response, 65_536);
  const result = new Response(body, {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
  });
  await cache.put(request, result.clone());
  return result;
}

export async function verifyAccess(
  request: Request,
  env: Pick<WorkerBindings, "ACCESS_TEAM_DOMAIN" | "ACCESS_AUD" | "OWNER_EMAIL">,
  keys?: JWTVerifyGetKey,
): Promise<string> {
  if (
    !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/u.test(env.ACCESS_TEAM_DOMAIN) ||
    env.ACCESS_AUD === "configure-before-deployment" ||
    !env.OWNER_EMAIL.includes("@")
  )
    throw new HttpError(503, "access_setup", "请先完成 Cloudflare Access 配置。");
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token)
    throw new HttpError(401, "access_required", "登录已到期，请重新登录 Cloudflare Access。");
  try {
    const keySet =
      keys ??
      createRemoteJWKSet(new URL(`${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`), {
        [customFetch]: publicKeys,
      });
    const { payload } = await jwtVerify(token, keySet, {
      issuer: env.ACCESS_TEAM_DOMAIN,
      audience: env.ACCESS_AUD,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "sub", "email"],
      clockTolerance: 5,
    });
    if (
      payload.type !== "app" ||
      typeof payload.email !== "string" ||
      payload.email.toLowerCase() !== env.OWNER_EMAIL.toLowerCase()
    )
      throw new HttpError(403, "access_owner", "这个阅读空间只对它的主人开放。");
    return payload.email;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, "access_required", "登录已到期，请重新登录 Cloudflare Access。");
  }
}
