import { readEnv, type Env } from "./env.js";

export type AuthMode = "password" | "supabase";

export interface PublicAuth {
  supabaseUrl: string;
  supabaseAnonKey: string;
  passwordLogin: boolean;
}

export function resolveAuthMode(env: Env, nodeEnv: string, supabaseConfigured: boolean): AuthMode {
  if (nodeEnv === "production") return "supabase";
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
