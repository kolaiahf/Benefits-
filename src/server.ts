import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { loadConfig, finchConfigured } from "./config.js";
import { Store } from "./db/store.js";
import { FinchClient } from "./finch/client.js";
import { buildApp } from "./http/app.js";
import { seedDatabase } from "./seed.js";

const config = loadConfig();
if (config.databaseUrl.startsWith("file:")) {
  const filePath = config.databaseUrl.slice("file:".length);
  if (filePath !== ":memory:" && !filePath.startsWith(":memory:")) {
    mkdirSync(dirname(filePath), { recursive: true });
  }
}

const store = await Store.open(config.databaseUrl);
await seedDatabase(store, config);
const finch = finchConfigured(config)
  ? new FinchClient({ ...config.finch, sandbox: config.finch.sandbox })
  : null;
const app = await buildApp({ config, store, finch });

const shutdown = async () => {
  await app.close();
  await store.close();
};
process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});

await app.listen({ port: config.port, host: config.host });
app.log.info({ port: config.port, finch: Boolean(finch) }, "Harbor Agency API listening");
