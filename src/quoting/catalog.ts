import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CatalogFile, CatalogPlan } from "./types.js";

let cached: CatalogFile | null = null;

export function loadRateCatalog(): CatalogFile {
  if (cached) return cached;
  const path = join(process.cwd(), "src/data/ca-small-group-catalog.json");
  cached = JSON.parse(readFileSync(path, "utf8")) as CatalogFile;
  return cached;
}

export function catalogPlans(): CatalogPlan[] {
  return loadRateCatalog().plans;
}
