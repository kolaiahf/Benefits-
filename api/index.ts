import { loadConfig, finchConfigured } from "../src/config.js";
import { Store } from "../src/db/store.js";
import { FinchClient } from "../src/finch/client.js";
import { buildApp } from "../src/http/app.js";
import { seedDatabase } from "../src/seed.js";
import type { IncomingMessage, ServerResponse } from "node:http";

type App = Awaited<ReturnType<typeof buildApp>>;

let ready: Promise<App> | null = null;

async function boot(): Promise<App> {
  const config = loadConfig();
  const store = await Store.open(config.databaseUrl);
  await seedDatabase(store, config);
  const finch = finchConfigured(config)
    ? new FinchClient({ ...config.finch, sandbox: config.finch.sandbox })
    : null;
  const app = await buildApp({ config, store, finch });
  await app.ready();
  return app;
}

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  ready ??= boot();
  const app = await ready;
  app.server.emit("request", request, response);
}
