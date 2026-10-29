import { readFileSync, writeFileSync } from "node:fs";
import { plansFromBlueShield } from "../src/rates/parseBlueShield.js";
import { region15ZipsFromRateBook, regionMapFromCensus } from "../src/rates/caRegions.js";

const rateBookPath = process.argv[2] ?? "/tmp/bsca/full.txt";
const zctaPath = process.argv[3] ?? "/tmp/census/zcta.txt";
const text = readFileSync(rateBookPath, "utf8");
const plans = plansFromBlueShield(text);
const medical = plans.filter((plan) => plan.line === "medical");
const dental = plans.filter((plan) => plan.line === "dental");
const vision = plans.filter((plan) => plan.line === "vision");
const unnamed = medical.filter((plan) => plan.name.includes("column "));
const region15 = region15ZipsFromRateBook(text);
const regions = regionMapFromCensus(readFileSync(zctaPath, "utf8"), region15);
writeFileSync("src/data/blueshield-ca-2026q4.json", JSON.stringify({
  document: "A46124GRP-2026Q4-SmallBusinessRateBook.pdf",
  effective_start: "2026-10-01",
  effective_end: "2026-12-31",
  plans,
}));
writeFileSync("src/data/ca-rating-regions.json", JSON.stringify(regions));
const sample = medical.find((plan) => plan.name.startsWith("Platinum Trio HMO 0/20"));
console.log(JSON.stringify({
  medical: medical.length,
  dental: dental.length,
  vision: vision.length,
  unnamed: unnamed.length,
  regions: Object.keys(regions).length,
  region15: region15.size,
  zip92101: regions["92101"],
  zip94105: regions["94105"],
  zip95814: regions["95814"],
  zip90001: regions["90001"],
  zip90601: regions["90601"],
  trioRegion1Age21: sample && "publishedAgeCents" in sample ? sample.publishedAgeCents?.["1"]?.["21"] : null,
  trioRegion19Age21: sample && "publishedAgeCents" in sample ? sample.publishedAgeCents?.["19"]?.["21"] : null,
  trioRegion19Age40: sample && "publishedAgeCents" in sample ? sample.publishedAgeCents?.["19"]?.["40"] : null,
  trioRegion14Age21: sample && "publishedAgeCents" in sample ? sample.publishedAgeCents?.["14"]?.["21"] : null,
}, null, 2));
