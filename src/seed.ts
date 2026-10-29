import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import type { AppConfig } from "./config.js";
import { sampleAreaFactors, samplePlans } from "./domain/catalog.js";
import type { Plan } from "./domain/types.js";
import type { Store } from "./db/store.js";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "data");

export function filedPlans(): Plan[] {
  const document = JSON.parse(readFileSync(join(dataDir, "blueshield-ca-2026q4.json"), "utf8")) as { plans: Plan[] };
  return document.plans;
}

export function californiaRatingRegions(): Array<{ zip: string; region: string }> {
  const map = JSON.parse(readFileSync(join(dataDir, "ca-rating-regions.json"), "utf8")) as Record<string, string>;
  return Object.entries(map).map(([zip, region]) => ({ zip, region }));
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
