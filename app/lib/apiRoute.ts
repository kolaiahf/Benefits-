import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readEnv } from "../../src/env";
import { proxyApiRequest, safeBootMessage } from "../../src/http/proxy";

interface PendingCookie {
  name: string;
  value: string;
  options: CookieOptions;
}

async function sessionAccessToken(): Promise<{ token: string | null; pending: PendingCookie[] }> {
  const url = readEnv(process.env, "NEXT_PUBLIC_SUPABASE_URL") || readEnv(process.env, "SUPABASE_URL");
  const key = readEnv(process.env, "NEXT_PUBLIC_SUPABASE_ANON_KEY") || readEnv(process.env, "SUPABASE_ANON_KEY");
  if (!url || !key) return { token: null, pending: [] };
  const cookieStore = await cookies();
  const pending: PendingCookie[] = [];
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        pending.push(...cookiesToSet);
      },
    },
  });
  const { data } = await supabase.auth.getSession();
  return { token: data.session?.access_token ?? null, pending };
}

export async function handleApi(request: Request): Promise<NextResponse> {
  try {
    const session = await sessionAccessToken();
    const proxied = await proxyApiRequest(request, session.token);
    const bytes = proxied.body ? new Uint8Array(proxied.body.byteLength) : null;
    if (bytes && proxied.body) bytes.set(proxied.body);
    const response = new NextResponse(bytes ? new Blob([bytes.buffer]) : null, { status: proxied.status, headers: proxied.headers });
    for (const cookie of session.pending) response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: { code: "not_configured", message: safeBootMessage(error) } },
      { status: 503 },
    );
  }
}
