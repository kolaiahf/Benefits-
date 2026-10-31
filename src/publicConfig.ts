import { readEnv, type Env } from "./env.js";

export type AuthMode = "password" | "supabase";

export interface PublicAuth {
  supabaseUrl: string;
  supabaseAnonKey: string;
  passwordLogin: boolean;
}

/**
 * Demo mode lets a Vercel preview run with password sign-in and a throwaway sqlite file.
 * It needs AUTH_MODE=password plus VERCEL_ENV=preview or DEMO_MODE=true, and it never
 * turns on for a Vercel production deployment.
 */
export function isDemoMode(env: Env): boolean {
  const vercelEnv = readEnv(env, "VERCEL_ENV");
  if (vercelEnv === "production") return false;
  if (readEnv(env, "AUTH_MODE") !== "password") return false;
  const demoFlag = readEnv(env, "DEMO_MODE").toLowerCase();
  return vercelEnv === "preview" || demoFlag === "true" || demoFlag === "1";
}

export function resolveAuthMode(env: Env, nodeEnv: string, supabaseConfigured: boolean): AuthMode {
  if (nodeEnv === "production") return isDemoMode(env) ? "password" : "supabase";
  if (nodeEnv === "test" && readEnv(env, "AUTH_MODE") !== "supabase") return "password";
  const requested = readEnv(env, "AUTH_MODE");
  if (requested === "password") return "password";
  if (requested === "supabase" || supabaseConfigured) return "supabase";
  return "password";
}

/** Safe to send to the browser. The anon key is public. Never put the service role here. */
export function readPublicAuth(env: Env = process.env): PublicAuth {
  const supabaseUrl = readEnv(env, "NEXT_PUBLIC_SUPABASE_URL") || readEnv(env, "SUPABASE_URL");
  const supabaseAnonKey = readEnv(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY") || readEnv(env, "SUPABASE_ANON_KEY");
  const nodeEnv = readEnv(env, "NODE_ENV") || "development";
  const mode = resolveAuthMode(env, nodeEnv, Boolean(supabaseUrl && supabaseAnonKey));
  return {
    supabaseUrl,
    supabaseAnonKey,
    passwordLogin: mode === "password",
  };
}
