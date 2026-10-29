export interface AppConfig {
  nodeEnv: string;
  host: string;
  port: number;
  databaseUrl: string;
  appSecret: string;
  webOrigin: string;
  bcryptRounds: number;
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? "development";
  const appSecret = env.APP_SECRET ?? (nodeEnv === "production" ? "" : "dev-only-secret-change-me-please-32");
  if (nodeEnv === "production" && appSecret.length < 32) {
    throw new Error("APP_SECRET must be at least 32 characters in production");
  }
  const password = env.SEED_BROKER_PASSWORD ?? "demo1234";
  if (nodeEnv === "production" && (password === "demo1234" || password.length < 12)) {
    throw new Error("Set SEED_BROKER_PASSWORD to a unique password of at least 12 characters before production boot");
  }
  const sandbox = env.FINCH_SANDBOX ?? "finch";
  return {
    nodeEnv,
    host: env.HOST ?? "0.0.0.0",
    port: Number(env.PORT ?? 8787),
    databaseUrl: env.DATABASE_URL ?? "file:./data/agency.db",
    appSecret,
    webOrigin: env.WEB_ORIGIN ?? "http://localhost:5173",
    bcryptRounds: Number(env.BCRYPT_ROUNDS ?? 10),
    seed: {
      email: (env.SEED_BROKER_EMAIL ?? "broker@example.com").toLowerCase(),
      password,
      name: env.SEED_BROKER_NAME ?? "Avery Chen",
    },
    finch: {
      clientId: env.FINCH_CLIENT_ID ?? "",
      clientSecret: env.FINCH_CLIENT_SECRET ?? "",
      redirectUri: env.FINCH_REDIRECT_URI ?? "http://localhost:5173/finch/callback",
      apiBase: env.FINCH_API_BASE ?? "https://api.tryfinch.com",
      sandbox: sandbox === "provider" || sandbox === "finch" ? sandbox : "",
    },
    ai: {
      baseUrl: env.AI_BASE_URL ?? "https://api.openai.com/v1",
      apiKey: env.AI_API_KEY ?? "",
      model: env.AI_MODEL ?? "gpt-4o-mini",
    },
  };
}

export function finchConfigured(config: AppConfig): boolean {
  return Boolean(config.finch.clientId && config.finch.clientSecret && config.finch.redirectUri);
}
