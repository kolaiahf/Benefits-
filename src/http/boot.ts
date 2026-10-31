import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { FastifyInstance } from "fastify";
import { loadConfig, finchConfigured, type AppConfig } from "../config.js";
import { Store } from "../db/store.js";
import { FinchClient } from "../finch/client.js";
import { buildApp } from "./app.js";
import { seedDatabase } from "../seed.js";

export interface RunningApp {
  app: FastifyInstance;
  store: Store;
  config: AppConfig;
}

let pending: Promise<RunningApp> | null = null;

export function bootApp(): Promise<RunningApp> {
  if (!pending) {
    pending = start().catch((error: unknown) => {
      pending = null;
      throw error;
    });
  }
  return pending;
}

export function assertProductionReady(config: AppConfig): void {
  if (config.nodeEnv !== "production") return;
  if (config.demoMode) {
    const path = config.databaseUrl.startsWith("file:") ? config.databaseUrl.slice("file:".length) : "";
    if (path !== ":memory:" && !path.startsWith("/tmp/")) {
      throw new Error("Demo mode needs DATABASE_URL=file:/tmp/<name>.db or file::memory:");
    }
    return;
  }
  if (!config.supabase.url || !config.supabase.anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required in production");
  }
  if (!config.databaseUrl.startsWith("postgres://") && !config.databaseUrl.startsWith("postgresql://")) {
    throw new Error("DATABASE_URL must be a Postgres connection string in production");
  }
}

async function start(): Promise<RunningApp> {
  const config = loadConfig();
  assertProductionReady(config);
  if (config.databaseUrl.startsWith("file:")) {
    const filePath = config.databaseUrl.slice("file:".length);
    if (!filePath.startsWith(":memory:") && filePath !== ":memory:") {
      mkdirSync(dirname(filePath), { recursive: true });
    }
  }
  const store = await Store.open(config.databaseUrl);
  await seedDatabase(store, config);
  const finch = finchConfigured(config)
    ? new FinchClient({ ...config.finch, sandbox: config.finch.sandbox })
    : null;
  const app = await buildApp({ config, store, finch });
  await app.ready();
  return { app, store, config };
}
