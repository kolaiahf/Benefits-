"use client";

import { useState, type FormEvent } from "react";
import { api, setAccessToken, setPasswordToken } from "./api";
import { useAuthConfig } from "./auth-context";
import { useBrand } from "./brand-context";
import { browserSupabase } from "./browserSupabase";

export function AccountForm({
  initialMode = "sign-in",
  notice = "",
  onSignedIn,
}: {
  initialMode?: "sign-in" | "sign-up";
  notice?: string;
  onSignedIn: () => void;
}) {
  const brand = useBrand();
  const auth = useAuthConfig();
  const supabaseReady = Boolean(auth.supabaseUrl && auth.supabaseAnonKey);
  const modeAvailable = supabaseReady && !auth.passwordLogin;
  const [mode, setMode] = useState<"sign-in" | "sign-up">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(notice);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (modeAvailable) {
        const supabase = browserSupabase(auth.supabaseUrl, auth.supabaseAnonKey);
        if (mode === "sign-up") {
          const { data, error: signUpError } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { name: name.trim() },
              emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
          });
          if (signUpError) throw new Error(signUpError.message);
          if (data.session?.access_token) setAccessToken(data.session.access_token);
          if (!data.session) {
            setMessage("Check your email to confirm the account, then sign in.");
            setMode("sign-in");
            return;
          }
        } else {
          const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
          if (signInError) throw new Error(signInError.message);
          if (data.session?.access_token) setAccessToken(data.session.access_token);
        }
        onSignedIn();
        return;
      }
      if (auth.passwordLogin) {
        const result = await api.login(email, password);
        setPasswordToken(result.token);
        onSignedIn();
        return;
      }
      setError("Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY before accounts can be created.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="panel login-card" onSubmit={submit}>
        <p className="kicker">{brand.agencyName}</p>
        <h1>{modeAvailable && mode === "sign-up" ? "Create your account" : "Sign in"}</h1>
        <p className="lede">Small-group medical, dental, and vision. Payroll connects through Finch.</p>
        {error && <div className="error">{error}</div>}
        {message && <div className="ok">{message}</div>}
        {!modeAvailable && !auth.passwordLogin && (
          <div className="banner">Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. Groups, census, quotes, and Finch connections are stored with DATABASE_URL.</div>
        )}
        {auth.passwordLogin && !modeAvailable && (
          <div className="banner">This server is using local password sign-in. Production uses Supabase Auth.</div>
        )}
        {(modeAvailable || auth.passwordLogin) && (
          <>
            {modeAvailable && mode === "sign-up" && (
              <label>Name
                <input name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required />
              </label>
            )}
            <label>Email
              <input name="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label>Password
              <input
                name="password"
                type="password"
                autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                minLength={modeAvailable && mode === "sign-up" ? 8 : 1}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "Working…" : modeAvailable && mode === "sign-up" ? "Create account" : "Sign in"}
            </button>
          </>
        )}
        {modeAvailable && (
          <button
            className="linkish"
            type="button"
            onClick={() => {
              setMode(mode === "sign-in" ? "sign-up" : "sign-in");
              setError("");
              setMessage("");
            }}
          >
            {mode === "sign-in" ? "Create an account" : "Already have an account? Sign in"}
          </button>
        )}
      </form>
    </div>
  );
}
