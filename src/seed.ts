import { readFileSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { loadBrand } from "./brand.js";
import type { AppConfig } from "./config.js";
import { sampleAreaFactors, samplePlans } from "./domain/catalog.js";
import type { Plan } from "./domain/types.js";
import type { Store } from "./db/store.js";

function readData<T>(name: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), "src/data", name), "utf8")) as T;
}

export function filedPlans(): Plan[] {
  return readData<{ plans: Plan[] }>("blueshield-ca-2026q4.json").plans;
}

export function californiaRatingRegions(): Array<{ zip: string; region: string }> {
  return Object.entries(readData<Record<string, string>>("ca-rating-regions.json")).map(([zip, region]) => ({ zip, region }));
}

export async function seedDatabase(store: Store, config: AppConfig): Promise<void> {
  if ((await store.countPlans()) === 0) await store.replacePlans(samplePlans());
  const plans = await store.listPlans();
  if (!plans.some((plan) => plan.rateBasis === "blue_shield_ca_filed")) {
    await store.upsertPlans(filedPlans());
  }
  if ((await store.ratingRegionMap()).size === 0) {
    await store.upsertRatingRegions(californiaRatingRegions());
  }
  if ((await store.countAreas()) === 0) await store.replaceAreas(sampleAreaFactors());
  if (config.seedBroker && (await store.countUsers()) === 0) {
    await store.createUser({
      id: crypto.randomUUID(),
      email: config.seed.email.toLowerCase(),
      name: config.seed.name,
      passwordHash: await bcrypt.hash(config.seed.password, config.bcryptRounds),
      role: "admin",
      createdAt: new Date().toISOString(),
    });
  }
  if (config.seedBroker) {
    const admin = await store.findUserByEmail(config.seed.email);
    if (admin?.role === "admin") await store.ensureAgency(admin.id, loadBrand().productName);
  }
}
