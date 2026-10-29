import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readPublicAuth } from "./src/publicConfig";

export async function middleware(request: NextRequest) {
  const auth = readPublicAuth();
  if (!auth.supabaseUrl || !auth.supabaseAnonKey || auth.passwordLogin) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(auth.supabaseUrl, auth.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const needsUser = path.startsWith("/groups") || path.startsWith("/finch");
  if (needsUser && !data.user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = "";
    redirectUrl.searchParams.set("next", `${path}${request.nextUrl.search}`);
    return NextResponse.redirect(redirectUrl);
  }
  if ((path === "/login" || path === "/signup") && data.user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/groups";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|v1/|health|docs|auth/).*)"],
};