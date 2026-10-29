import { bootApp } from "./boot.js";

export interface ProxiedResponse {
  status: number;
  headers: Headers;
  body: Uint8Array | null;
}

const dropped = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade", "host", "content-length", "expect"]);

export async function proxyApiRequest(request: Request, accessToken: string | null): Promise<ProxiedResponse> {
  const running = await bootApp();
  const url = new URL(request.url);
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    if (!dropped.has(key.toLowerCase())) headers[key] = value;
  });
  if (accessToken && !headers.authorization) headers.authorization = `Bearer ${accessToken}`;
  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  const payload = hasBody ? Buffer.from(await request.arrayBuffer()) : undefined;
  const result = await running.app.inject({
    method: method as "GET",
    url: `${url.pathname}${url.search}`,
    headers,
    payload,
  });
  const responseHeaders = new Headers();
  for (const [key, value] of Object.entries(result.headers)) {
    if (value === undefined) continue;
    if (dropped.has(key.toLowerCase())) continue;
    if (Array.isArray(value)) {
      for (const item of value) responseHeaders.append(key, String(item));
    } else {
      responseHeaders.set(key, String(value));
    }
  }
  const body = result.statusCode === 204 ? null : Uint8Array.from(result.rawPayload);
  return { status: result.statusCode, headers: responseHeaders, body };
}

export function safeBootMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message && !/postgres(?:ql)?:|password|secret|api[_-]?key|bearer/i.test(message)) return message;
  return "Server failed to start. Check DATABASE_URL, APP_SECRET, and the Supabase settings.";
}
