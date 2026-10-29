import bcrypt from "bcryptjs";
import type { AppConfig } from "./config.js";
import { sampleAreaFactors, samplePlans } from "./domain/catalog.js";
import type { Store } from "./db/store.js";

export async function seedDatabase(store: Store, config: AppConfig): Promise<void> {
  if ((await store.countPlans()) === 0) await store.replacePlans(samplePlans());
  if ((await store.countAreas()) === 0) await store.replaceAreas(sampleAreaFactors());
  if ((await store.countUsers()) === 0) {
    await store.createUser({
      id: crypto.randomUUID(),
      email: config.seed.email.toLowerCase(),
      name: config.seed.name,
      passwordHash: await bcrypt.hash(config.seed.password, config.bcryptRounds),
      role: "admin",
      createdAt: new Date().toISOString(),
    });
  }
}
