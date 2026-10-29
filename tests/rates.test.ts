import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ageOn } from "../src/domain/money.js";
import { rateQuote } from "../src/domain/rating.js";
import type { CensusMember, MedicalPlan, Plan } from "../src/domain/types.js";
import { parseZipTokens, ratingRegionForZip, region15ZipsFromRateBook } from "../src/rates/caRegions.js";
import { parseBlueShieldLayout } from "../src/rates/parseBlueShield.js";
import { californiaRatingRegions, filedPlans } from "../src/seed.js";

const book = readFileSync(new URL("../src/data/blueshield-ca-2026q4.json", import.meta.url), "utf8");
const loaded = JSON.parse(book) as { plans: Plan[] };

describe("Blue Shield Q4 2026 rate book parser", () => {
  const fixture = readFileSync(new URL("./fixtures/bsca-region1-full-ppo.txt", import.meta.url), "utf8");

  it("reads the published region 1 Full PPO age-21 and age-40 cells", () => {
    const tables = parseBlueShieldLayout(fixture).medical;
    const table = tables.find((entry) => entry.region === "1" && entry.names.some((name) => name.includes("250/10")));
    expect(table).toBeTruthy();
    const column = table?.names.findIndex((name) => name.includes("Platinum Full PPO") && name.includes("250/10")) ?? -1;
    expect(column).toBe(0);
    expect(table?.ages["21"]?.[column]).toBe(83_077);
    expect(table?.ages["40"]?.[column]).toBe(106_172);
    expect(table?.ages["0-14"]?.[column]).toBe(63_554);
  });

  it("keeps those same cells in the loaded catalog, plus region 14 and 19 checks", () => {
    const platinum = loaded.plans.find((plan) => plan.name === "Platinum Full PPO 250/10 OffEx");
    const gold = loaded.plans.find((plan) => plan.name === "Gold Full PPO 1000/30 OffEx");
    const trio = loaded.plans.find((plan) => plan.name === "Platinum Trio HMO 0/20 OffEx");
    expect(platinum && "publishedAgeCents" in platinum && platinum.publishedAgeCents?.["1"]?.["21"]).toBe(83_077);
    expect(platinum && "publishedAgeCents" in platinum && platinum.publishedAgeCents?.["1"]?.["40"]).toBe(106_172);
    expect(platinum && "publishedAgeCents" in platinum && platinum.publishedAgeCents?.["19"]?.["21"]).toBe(77_876);
    expect(platinum && "publishedAgeCents" in platinum && platinum.publishedAgeCents?.["19"]?.["40"]).toBe(99_525);
    expect(gold && "publishedAgeCents" in gold && gold.publishedAgeCents?.["1"]?.["21"]).toBe(70_009);
    expect(gold && "publishedAgeCents" in gold && gold.publishedAgeCents?.["19"]?.["21"]).toBe(65_626);
    expect(gold && "publishedAgeCents" in gold && gold.publishedAgeCents?.["19"]?.["40"]).toBe(83_870);
    expect(trio && "publishedAgeCents" in trio && trio.publishedAgeCents?.["1"]?.["21"]).toBe(74_034);
    expect(trio && "publishedAgeCents" in trio && trio.publishedAgeCents?.["1"]?.["40"]).toBe(94_615);
    expect(trio && "publishedAgeCents" in trio && trio.publishedAgeCents?.["14"]?.["21"]).toBe(48_736);
    expect(trio && "publishedAgeCents" in trio && trio.publishedAgeCents?.["19"]?.["21"]).toBe(53_502);
    expect(trio && "publishedAgeCents" in trio && trio.publishedAgeCents?.["19"]?.["40"]).toBe(68_375);
    expect(trio && "publishedAgeCents" in trio && trio.publishedAgeCents?.["13"]).toBeUndefined();
  });

  it("prices a San Diego employee from the filed age-40 cell, with no tobacco load", () => {
    const gold = filedPlans().find((plan) => plan.id === "bsc-2026q4-gold-full-ppo-1000-30-offex") as MedicalPlan;
    const dental = filedPlans().find((plan) => plan.id === "bsc-2026q4-d714");
    const vision = filedPlans().find((plan) => plan.id === "bsc-2026q4-v517");
    const member: CensusMember = {
      id: "m1",
      subscriberId: "E1",
      relationship: "self",
      firstName: "Mina",
      lastName: "Cho",
      dateOfBirth: "1986-07-01",
      zip: "92101",
      gender: "female",
      tobacco: true,
      annualSalaryCents: null,
      email: null,
      waived: false,
    };
    expect(ageOn(member.dateOfBirth, "2026-10-01")).toBe(40);
    const quote = rateQuote({
      members: [member],
      plans: [gold, dental, vision].filter((plan): plan is Plan => Boolean(plan)),
      areas: [{ zip: "92101", state: "CA", ratingArea: "sample", factor: 9, source: "illustrative_sample" }],
      effectiveDate: "2026-10-01",
      contribution: { mode: "percent_of_premium", employerPercent: 75 },
      employerZip: "92101",
      ratingRegionByZip: new Map([["92101", "19"]]),
    });
    const medical = quote.plans.find((plan) => plan.planId === gold.id);
    expect(quote.ratingRegion).toBe("19");
    expect(medical?.monthlyPremiumCents).toBe(83_870);
    expect(medical?.rateLabel).toContain("public filed rates");
    expect(medical?.households[0].members[0].factors.tobacco).toBe(1);
    const dentalQuote = quote.plans.find((plan) => plan.planId === "bsc-2026q4-d714");
    expect(dentalQuote?.monthlyPremiumCents).toBe(7_380);
    const visionQuote = quote.plans.find((plan) => plan.planId === "bsc-2026q4-v517");
    expect(visionQuote?.monthlyPremiumCents).toBe(1_050);
  });
});

describe("California rating regions", () => {
  it("expands ZIP ranges and applies the Los Angeles split", () => {
    expect(parseZipTokens("90637-90639, 90640")).toEqual(["90637", "90638", "90639", "90640"]);
    const region15 = new Set(["90601"]);
    expect(ratingRegionForZip({ zip: "90601", county: "Los Angeles County", region15 })).toBe("15");
    expect(ratingRegionForZip({ zip: "90001", county: "Los Angeles County", region15 })).toBe("16");
    expect(ratingRegionForZip({ zip: "92101", county: "San Diego County", region15 })).toBe("19");
    expect(ratingRegionForZip({ zip: "94105", county: "San Francisco County", region15 })).toBe("4");
    expect(ratingRegionForZip({ zip: "95814", county: "Sacramento County", region15 })).toBe("3");
  });

  it("loads the Census ZCTA map for the demo ZIPs", () => {
    const regions = Object.fromEntries(californiaRatingRegions().map((row) => [row.zip, row.region]));
    expect(regions["92101"]).toBe("19");
    expect(regions["94105"]).toBe("4");
    expect(regions["95814"]).toBe("3");
    expect(regions["90001"]).toBe("16");
    expect(regions["90601"]).toBe("15");
    expect(region15ZipsFromRateBook("Los Angeles Region 15 ZIP codes: 90601, 90602.\n\nnext")).toEqual(new Set(["90601", "90602"]));
  });
});
