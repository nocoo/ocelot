import type { AuthorProfile } from "../src/models/contracts";
import { HttpError, readJson, readLimited } from "./http";

const profileEndpoint = "https://lizheng.blog/api/authors/profile";
const empty: AuthorProfile = { name: null, avatar: null };

async function publicResource(url: string, type: RegExp, limit: number): Promise<Response | null> {
  try {
    const cache = await caches.open("ocelot-public-profiles");
    const cached = await cache.match(url);
    if (cached) return cached.headers.has("Retry-After") ? null : cached;
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      headers: {
        Accept: "application/json, image/*;q=0.9",
        "User-Agent": "Ocelot (+https://github.com/nocoo/ocelot)",
      },
    });
    if (response.status === 429) {
      await response.body?.cancel();
      // Store a cacheable backoff marker; it is never forwarded as a profile or avatar.
      await cache.put(
        url,
        Response.json(null, {
          headers: { "Cache-Control": "public, max-age=60", "Retry-After": "60" },
        }),
      );
      return null;
    }
    const contentType = response.headers.get("Content-Type")?.split(";")[0].trim() ?? "";
    if (!response.ok || !type.test(contentType)) {
      await response.body?.cancel();
      return null;
    }
    const result = new Response(await readLimited(response, limit), {
      headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=3600" },
    });
    await cache.put(url, result.clone());
    return result;
  } catch {
    return null;
  }
}

export async function authorProfile(email: string): Promise<AuthorProfile> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(email.trim().toLowerCase()),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const response = await publicResource(
    `${profileEndpoint}?hash=${hash}`,
    /^application\/json$/u,
    8192,
  );
  if (!response) return empty;
  try {
    const body = await readJson<unknown>(response, 8192);
    if (!body || typeof body !== "object") return empty;
    const { name, avatar } = body as Record<string, unknown>;
    let avatarUrl: string | null = null;
    if (typeof avatar === "string" && avatar.length <= 2048 && URL.canParse(avatar)) {
      const url = new URL(avatar);
      if (url.origin === "https://b.no.mt" && !url.username && !url.password) avatarUrl = url.href;
    }
    return {
      name: typeof name === "string" && name.trim() ? name.trim().slice(0, 120) : null,
      avatar: avatarUrl,
    };
  } catch {
    return empty;
  }
}

export async function authorAvatar(email: string): Promise<Response> {
  const profile = await authorProfile(email);
  const response = profile.avatar
    ? await publicResource(profile.avatar, /^image\/(avif|gif|jpeg|png|webp)$/u, 524_288)
    : null;
  if (!response) throw new HttpError(404, "avatar_unavailable", "头像暂不可用。");
  return response;
}
