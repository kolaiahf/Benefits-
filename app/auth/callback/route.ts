import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readEnv } from "../../../src/env";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  const supabaseUrl = readEnv(process.env, "NEXT_PUBLIC_SUPABASE_URL") || readEnv(process.env, "SUPABASE_URL");
  const supabaseAnonKey = readEnv(process.env, "NEXT_PUBLIC_SUPABASE_ANON_KEY") || readEnv(process.env, "SUPABASE_ANON_KEY");
  const success = NextResponse.redirect(new URL(next, url.origin));
  const failure = NextResponse.redirect(new URL("/login?error=Could+not+confirm+the+account", url.origin));
  if (!code || !supabaseUrl || !supabaseAnonKey) return failure;

  const cookieStore = await cookies();
  const pending: Array<{ name: string; value: string; options: CookieOptions }> = [];
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        pending.push(...cookiesToSet);
      },
    },
  });
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return failure;
  for (const cookie of pending) success.cookies.set(cookie.name, cookie.value, cookie.options);
  return success;
}

function safeNext(value: string | null): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/quotes";
}
