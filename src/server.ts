import { loadBrand } from "./brand.js";
import { bootApp } from "./http/boot.js";

const { app, store, config } = await bootApp();
const brand = loadBrand();

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
app.log.info({ port: config.port, auth: config.authMode }, `${brand.agencyName} API listening`);
