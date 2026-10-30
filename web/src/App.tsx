"use client";

import { useCallback, useEffect, useState } from "react";
import censusCsv from "../../examples/northwind-census.csv?raw";
import { AccountForm } from "./AccountForm";
import { api, setAccessToken, setPasswordToken, type User } from "./api";
import { useAuthConfig } from "./auth-context";
import { browserSupabase } from "./browserSupabase";
import { FinchCallback } from "./FinchCallback";
import { GroupPage } from "./GroupPage";
import { GroupsHome } from "./GroupsHome";
import { LoadingScreen, Shell } from "./Shell";

export function App() {
  const auth = useAuthConfig();
  const [path, setPath] = useState(window.location.pathname);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const go = useCallback((next: string) => {
    window.history.pushState({}, "", next);
    setPath(next);
  }, []);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    api.me().then((result) => setUser(result.user)).catch(() => setUser(null)).finally(() => setReady(true));
  }, [path]);

  async function signOut() {
    setPasswordToken(null);
    setAccessToken(null);
    if (auth.supabaseUrl && auth.supabaseAnonKey && !auth.passwordLogin) {
      await browserSupabase(auth.supabaseUrl, auth.supabaseAnonKey).auth.signOut();
    }
    setUser(null);
    go("/login");
  }

  if (!ready) return <LoadingScreen />;
  if (path === "/finch/callback") return <FinchCallback go={go} />;
  if (!user) return <AccountForm onSignedIn={() => { go("/groups"); }} />;

  const groupMatch = /^\/groups\/([^/]+)$/.exec(path);
  return (
    <Shell user={user} onSignOut={() => void signOut()}>
      {groupMatch ? <GroupPage groupId={groupMatch[1]} sampleCensus={censusCsv} /> : <GroupsHome go={go} />}
    </Shell>
  );
}
