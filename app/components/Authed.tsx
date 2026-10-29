"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api, setAccessToken, setPasswordToken, type User } from "../../web/src/api";
import { useAuthConfig } from "../../web/src/auth-context";
import { browserSupabase } from "../../web/src/browserSupabase";
import { LoadingScreen, Shell } from "../../web/src/Shell";

export function Authed({ children }: { children: ReactNode }) {
  const auth = useAuthConfig();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.me()
      .then((result) => {
        if (!cancelled) setUser(result.user);
      })
      .catch(() => {
        if (!cancelled) router.replace("/login");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function signOut() {
    setPasswordToken(null);
    setAccessToken(null);
    if (auth.supabaseUrl && auth.supabaseAnonKey && !auth.passwordLogin) {
      await browserSupabase(auth.supabaseUrl, auth.supabaseAnonKey).auth.signOut();
    }
    router.replace("/login");
    router.refresh();
  }

  if (!user) return <LoadingScreen />;
  return <Shell user={user} onSignOut={() => void signOut()}>{children}</Shell>;
}
