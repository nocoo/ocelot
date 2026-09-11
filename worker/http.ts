import type { ApiFailure } from "../src/models/contracts";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAt?: number,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function failure(error: unknown): Response {
  const known =
    error instanceof HttpError
      ? error
      : new HttpError(500, "internal", "暂时无法完成请求，请稍后重试。");
  const body: ApiFailure = { code: known.code, message: known.message };
  if (known.retryAt) body.retryAt = known.retryAt;
  const response = json({ error: body }, known.status);
  if (known.retryAt)
    response.headers.set(
      "Retry-After",
      String(Math.max(1, Math.ceil((known.retryAt - Date.now()) / 1000))),
    );
  return response;
}

export function securityHeaders(response: Response): Response {
  const secured = new Response(response.body, response);
  secured.headers.set("X-Content-Type-Options", "nosniff");
  secured.headers.set("Referrer-Policy", "no-referrer");
  secured.headers.set("X-Frame-Options", "DENY");
  secured.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  secured.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  );
  secured.headers.set("Cache-Control", "private, no-store");
  return secured;
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("Origin");
  const site = request.headers.get("Sec-Fetch-Site");
  if (site === "cross-site" || (origin && origin !== new URL(request.url).origin)) {
    throw new HttpError(403, "origin", "请在 Ocelot 页面内完成此操作。");
  }
  if (
    !["GET", "HEAD"].includes(request.method) &&
    request.headers.get("X-Ocelot-Request") !== "1"
  ) {
    throw new HttpError(403, "origin", "请在 Ocelot 页面内完成此操作。");
  }
}

export async function readLimited(
  response: Response | Request,
  limit: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(response.headers.get("Content-Length")) > limit)
    throw new HttpError(413, "too_large", "这个文件超过了阅读器的大小限制。");
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new HttpError(413, "too_large", "这个文件超过了阅读器的大小限制。");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export async function readJson<T>(response: Response | Request, limit = 4_194_304): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await readLimited(response, limit))) as T;
}
