import { readEnv, type Env } from "./env.js";
import { isDemoMode, resolveAuthMode, type AuthMode } from "./publicConfig.js";

export interface AppConfig {
  nodeEnv: string;
  host: string;
  port: number;
  databaseUrl: string;
  appSecret: string;
  webOrigin: string;
  bcryptRounds: number;
  authMode: AuthMode;
  demoMode: boolean;
  seedBroker: boolean;
  supabase: { url: string; anonKey: string };
  seed: { email: string; password: string; name: string };
  finch: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    apiBase: string;
    sandbox: "finch" | "provider" | "";
  };
  ai: { baseUrl: string; apiKey: string; model: string };
}

export function loadConfig(env: Env = process.env): AppConfig {
  const nodeEnv = readEnv(env, "NODE_ENV") || "development";
  const appSecret = readEnv(env, "APP_SECRET") || (nodeEnv === "production" ? "" : "dev-only-secret-change-me-please-32");
  if (nodeEnv === "production" && appSecret.length < 32) {
    throw new Error("APP_SECRET must be at least 32 characters in production");
  }
  const supabaseUrl = readEnv(env, "NEXT_PUBLIC_SUPABASE_URL") || readEnv(env, "SUPABASE_URL");
  const supabaseAnonKey = readEnv(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY") || readEnv(env, "SUPABASE_ANON_KEY");
  const authMode = resolveAuthMode(env, nodeEnv, Boolean(supabaseUrl && supabaseAnonKey));
  const explicitPassword = readEnv(env, "SEED_BROKER_PASSWORD");
  const seedBroker = authMode === "password" || explicitPassword.length > 0;
  const password = explicitPassword || "demo1234";
  if (nodeEnv === "production" && seedBroker && (password === "demo1234" || password.length < 12)) {
    throw new Error("Set SEED_BROKER_PASSWORD to a unique password of at least 12 characters before production boot");
  }
  const sandbox = readEnv(env, "FINCH_SANDBOX") || "finch";
  return {
    nodeEnv,
    host: readEnv(env, "HOST") || "0.0.0.0",
    port: Number(readEnv(env, "PORT") || 8787),
    databaseUrl: readEnv(env, "DATABASE_URL") || "file:./data/agency.db",
    appSecret,
    webOrigin: readEnv(env, "WEB_ORIGIN") || "http://localhost:3000",
    bcryptRounds: Number(readEnv(env, "BCRYPT_ROUNDS") || 10),
    authMode,
    demoMode: isDemoMode(env),
    seedBroker,
    supabase: { url: supabaseUrl, anonKey: supabaseAnonKey },
    seed: {
      email: (readEnv(env, "SEED_BROKER_EMAIL") || "broker@example.com").toLowerCase(),
      password,
      name: readEnv(env, "SEED_BROKER_NAME") || "Avery Chen",
    },
    finch: {
      clientId: readEnv(env, "FINCH_CLIENT_ID"),
      clientSecret: readEnv(env, "FINCH_CLIENT_SECRET"),
      redirectUri: readEnv(env, "FINCH_REDIRECT_URI") || "http://localhost:3000/finch/callback",
      apiBase: readEnv(env, "FINCH_API_BASE") || "https://api.tryfinch.com",
      sandbox: sandbox === "provider" || sandbox === "finch" ? sandbox : "",
    },
    ai: {
      baseUrl: readEnv(env, "AI_BASE_URL") || "https://api.openai.com/v1",
      apiKey: readEnv(env, "AI_API_KEY"),
      model: readEnv(env, "AI_MODEL") || "gpt-4o-mini",
    },
  };
}

export function finchConfigured(config: AppConfig): boolean {
  return Boolean(config.finch.clientId && config.finch.clientSecret && config.finch.redirectUri);
}
