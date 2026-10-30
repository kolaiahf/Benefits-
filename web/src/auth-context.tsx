"use client";

import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { PublicAuth } from "../../src/publicConfig";
import { setAccessToken } from "./api";
import { browserSupabase } from "./browserSupabase";

const empty: PublicAuth = { supabaseUrl: "", supabaseAnonKey: "", passwordLogin: false };
const AuthContext = createContext<PublicAuth>(empty);

export function AuthProvider({ auth, children }: { auth: PublicAuth; children: ReactNode }) {
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuthConfig(): PublicAuth {
  return useContext(AuthContext);
}

export function AuthSessionSync({ children }: { children: ReactNode }) {
  const auth = useAuthConfig();
  useEffect(() => {
    if (!auth.supabaseUrl || !auth.supabaseAnonKey || auth.passwordLogin) return;
    const supabase = browserSupabase(auth.supabaseUrl, auth.supabaseAnonKey);
    const { data } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setAccessToken(session?.access_token ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, [auth.supabaseUrl, auth.supabaseAnonKey, auth.passwordLogin]);
  return children;
}
