import { readFileSync } from "node:fs";
import { plansFromBlueShield } from "../parseBlueShield.js";
import type { MedicalPlan } from "../../domain/types.js";
import type { CatalogFile, CatalogPlan } from "../../quoting/types.js";
import { benefitsFromName, metalOf, networkOf, slug } from "./benefits.js";
import { HEALTH_NET_PPO_NAMES, parseHealthNetPpo } from "./parseHealthNet.js";
import { parseKaiserText } from "./parseKaiser.js";
import { parseSharp } from "./parseSharp.js";
import { parseSutter } from "./parseSutter.js";

export interface BookInputs {
  healthNetText?: string;
  sharpText?: string;
  sutterText?: string;
  kaiserTexts?: string[];
  blueShieldQ3Text?: string;
  blueShieldQ4?: {
    document: string;
    effective_start: string;
    effective_end: string;
    plans: MedicalPlan[];
  };
  generatedAt?: string;
}

export function buildCatalog(inputs: BookInputs): CatalogFile {
  const notes: string[] = [];
  const plans: CatalogPlan[] = [];

  if (inputs.healthNetText) {
    const regions = parseHealthNetPpo(inputs.healthNetText);
    const byName = new Map<string, CatalogPlan>();
    for (const region of regions) {
      region.age21Cents.forEach((cents, index) => {
        const name = HEALTH_NET_PPO_NAMES[index];
        const id = `hn-2026q3-${slug(name)}`;
        const existing = byName.get(id);
        if (existing) {
          existing.baseCentsByArea[region.region] = cents;
          return;
        }
        byName.set(id, planFromName({
          id,
          carrierId: "health-net",
          carrierName: "Health Net",
          periodId: "2026q3",
          periodLabel: "July 1–September 30, 2026",
          effectiveStart: "2026-07-01",
          effectiveEnd: "2026-09-30",
          name,
          source: "Health Net small business rate guide, new and renewing business effective July 1 through September 30, 2026. PPO section.",
          area: region.region,
          cents,
        }));
      });
    }
    plans.push(...byName.values());
    notes.push(
      regions.length
        ? `Health Net PPO: ${byName.size} plans across rating areas ${regions.map((region) => region.region).join(", ")}. HMO pages split one plan set across continued columns and were not loaded.`
        : "Health Net PPO tables were not found.",
    );
  }

  if (inputs.sharpText) {
    const sharp = parseSharp(inputs.sharpText);
    for (const row of sharp.rates) {
      const name = `${row.family} ${row.name}`;
      const id = `sharp-2026q4-${row.metal}-${slug(name)}`;
      plans.push({
        id,
        carrierId: "sharp",
        carrierName: "Sharp Health Plan",
        periodId: "2026q4",
        periodLabel: "October 1–December 31, 2026",
        effectiveStart: "2026-10-01",
        effectiveEnd: "2026-12-31",
        name,
        metal: row.metal,
        network: "HMO",
        deductibleCents: null,
        oopMaxCents: null,
        coinsurancePercent: null,
        primaryCare: null,
        specialist: null,
        urgentCare: null,
        emergencyRoom: null,
        prescriptions: null,
        hsa: /HDHP/i.test(row.name),
        baseCentsByArea: { "19": row.age21Cents },
        source: "Sharp Health Plan non-mirrored small group rates effective October 1–December 31, 2026. Stored as rating area 19 because the book does not print a region.",
      });
    }
    notes.push(
      `Sharp Health Plan Q4 2026 non-mirrored medical tables: ${sharp.rates.length} plans, stored as rating area 19 (San Diego). The book does not label rating areas. Mirrored sheets and supplemental riders were not loaded.` +
        (sharp.skippedVariants ? ` ${sharp.skippedVariants} repeated plan names with a different age-21 rate were skipped.` : ""),
    );
  }

  if (inputs.sutterText) {
    const rows = parseSutter(inputs.sutterText);
    const byId = new Map<string, CatalogPlan>();
    for (const row of rows) {
      const id = `sutter-2026q4-${slug(row.name)}`;
      const hint = benefitsFromName(`${row.metal} ${row.name}`);
      let plan = byId.get(id);
      if (!plan) {
        plan = {
          id,
          carrierId: "sutter",
          carrierName: "Sutter Health Plus",
          periodId: "2026q4",
          periodLabel: "October 1–December 31, 2026",
          effectiveStart: "2026-10-01",
          effectiveEnd: "2026-12-31",
          name: row.name,
          metal: row.metal,
          network: "HMO",
          deductibleCents: hint.deductibleCents,
          oopMaxCents: null,
          coinsurancePercent: hint.coinsurancePercent,
          primaryCare: hint.primaryCare,
          specialist: null,
          urgentCare: null,
          emergencyRoom: null,
          prescriptions: null,
          hsa: hint.hsa || /HDHP/i.test(row.name),
          baseCentsByArea: {},
          source: "Sutter Health Plan small group rate guide effective October 1, 2026. Rating areas 1–10.",
        };
        byId.set(id, plan);
      }
      plan.baseCentsByArea[row.region] = row.age21Cents;
    }
    plans.push(...byId.values());
    const areas = [...new Set(rows.map((row) => row.region))].sort((a, b) => Number(a) - Number(b));
    notes.push(`Sutter Health Plan rates effective October 1, 2026: ${byId.size} plans in rating areas ${areas.join(", ") || "none"}. Areas 11–19 are not in this book. Copays are not printed in the rate tables.`);
  }

  if (inputs.kaiserTexts?.length) {
    const count = loadKaiser(inputs.kaiserTexts, plans);
    notes.push(
      `Kaiser Permanente HMO rate sheet labeled rating areas 4 and 8, effective January 1–December 1, 2026: ${count} plans. The same age-21 rate is stored for both areas. Other California areas are not in this file.`,
    );
  }

  if (inputs.blueShieldQ3Text) {
    const medical = plansFromBlueShield(inputs.blueShieldQ3Text).filter((item): item is MedicalPlan => item.line === "medical");
    const loaded = loadBlueShield(medical, {
      idPrefix: "bsc-2026q3",
      periodId: "2026q3",
      periodLabel: "July 1–September 30, 2026",
      effectiveStart: "2026-07-01",
      effectiveEnd: "2026-09-30",
      source: "Blue Shield of California 2026 Q3 small business rate book, rating regions 18 and 19.",
    }, plans);
    notes.push(`Blue Shield Q3 2026 attachment: ${loaded} medical plans. This book is regions 18 and 19 only. Out-of-pocket maximums are not printed in the rate tables.`);
  }

  if (inputs.blueShieldQ4) {
    const medical = inputs.blueShieldQ4.plans.filter((item) => item.line === "medical");
    const loaded = loadBlueShield(medical, {
      idPrefix: "bsc-2026q4",
      periodId: "2026q4",
      periodLabel: "October 1–December 31, 2026",
      effectiveStart: inputs.blueShieldQ4.effective_start,
      effectiveEnd: inputs.blueShieldQ4.effective_end,
      source: `Blue Shield of California Q4 2026 small business rate book (${inputs.blueShieldQ4.document}). Age-21 cell used as the base rate.`,
    }, plans);
    notes.push(`Blue Shield Q4 2026 filed extract already in the repo: ${loaded} medical plans for the regions present in that file.`);
  }

  notes.push("Member premium = round(area age-21 base × federal default age factor). Published age cells can differ by about a cent because carriers round each age. Anthem, UnitedHealthcare, Western Health Advantage, and CaliforniaChoice are not loaded.");
  notes.push("Rates are examples from public rate books, not a quote or a guarantee of coverage.");

  return {
    generatedAt: inputs.generatedAt ?? new Date().toISOString(),
    notes,
    plans,
  };
}

export function readCatalogJson(path: string): CatalogFile {
  return JSON.parse(readFileSync(path, "utf8")) as CatalogFile;
}

function loadKaiser(texts: string[], plans: CatalogPlan[]): number {
  let count = 0;
  for (const text of texts) {
    const table = parseKaiserText(text);
    if (!table || !table.areas.length) continue;
    for (const column of table.columns) {
      const hint = benefitsFromName(column.name);
      const metal = hint.metal;
      if (!metal || !column.name) continue;
      const id = `kp-2026-${slug(column.name)}`;
      let plan = plans.find((item) => item.id === id);
      if (!plan) {
        plan = {
          id,
          carrierId: "kaiser",
          carrierName: "Kaiser Permanente",
          periodId: "2026",
          periodLabel: "January 1–December 31, 2026",
          effectiveStart: "2026-01-01",
          effectiveEnd: "2026-12-31",
          name: column.name,
          metal,
          network: "HMO",
          deductibleCents: hint.deductibleCents,
          oopMaxCents: null,
          coinsurancePercent: hint.coinsurancePercent,
          primaryCare: hint.primaryCare,
          specialist: null,
          urgentCare: null,
          emergencyRoom: null,
          prescriptions: null,
          hsa: hint.hsa,
          baseCentsByArea: {},
          source: "Kaiser Permanente small business HMO rates for rating areas 4 and 8, effective dates January 1, 2026–December 1, 2026.",
        };
        plans.push(plan);
        count += 1;
      }
      for (const area of table.areas) {
        plan.baseCentsByArea[area] = column.age21Cents;
      }
    }
  }
  return count;
}

function loadBlueShield(
  medical: MedicalPlan[],
  meta: {
    idPrefix: string;
    periodId: string;
    periodLabel: string;
    effectiveStart: string;
    effectiveEnd: string;
    source: string;
  },
  plans: CatalogPlan[],
): number {
  let count = 0;
  for (const item of medical) {
    const bases: Record<string, number> = {};
    for (const [area, bands] of Object.entries(item.publishedAgeCents ?? {})) {
      const age21 = bands["21"];
      if (age21) bases[area] = age21;
    }
    if (!Object.keys(bases).length) continue;
    const hint = benefitsFromName(item.name);
    const id = `${meta.idPrefix}-${slug(item.name)}`;
    plans.push({
      id,
      carrierId: "blue-shield",
      carrierName: "Blue Shield of California",
      periodId: meta.periodId,
      periodLabel: meta.periodLabel,
      effectiveStart: meta.effectiveStart,
      effectiveEnd: meta.effectiveEnd,
      name: item.name,
      metal: item.metal,
      network: item.planType === "HMO" ? "HMO" : item.planType === "EPO" ? "EPO" : "PPO",
      deductibleCents: item.deductibleIndividualCents,
      oopMaxCents: item.oopIndividualCents,
      coinsurancePercent: hint.coinsurancePercent,
      primaryCare: hint.primaryCare ?? (item.pcpCopayCents != null ? `$${(item.pcpCopayCents / 100).toFixed(0)}` : null),
      specialist: item.specialistCopayCents != null ? `$${(item.specialistCopayCents / 100).toFixed(0)}` : null,
      urgentCare: null,
      emergencyRoom: null,
      prescriptions: item.rxGenericCents != null ? `$${(item.rxGenericCents / 100).toFixed(0)}` : null,
      hsa: item.hsaEligible,
      baseCentsByArea: bases,
      source: meta.source,
    });
    count += 1;
  }
  return count;
}

function planFromName(input: {
  id: string;
  carrierId: string;
  carrierName: string;
  periodId: string;
  periodLabel: string;
  effectiveStart: string;
  effectiveEnd: string;
  name: string;
  source: string;
  area: string;
  cents: number;
}): CatalogPlan {
  const hint = benefitsFromName(input.name);
  const metal = hint.metal ?? metalOf(input.name);
  const network = hint.network ?? networkOf(input.name) ?? "PPO";
  if (!metal) throw new Error(`Missing metal for ${input.name}`);
  return {
    id: input.id,
    carrierId: input.carrierId,
    carrierName: input.carrierName,
    periodId: input.periodId,
    periodLabel: input.periodLabel,
    effectiveStart: input.effectiveStart,
    effectiveEnd: input.effectiveEnd,
    name: input.name,
    metal,
    network,
    deductibleCents: hint.deductibleCents,
    oopMaxCents: null,
    coinsurancePercent: hint.coinsurancePercent,
    primaryCare: hint.primaryCare,
    specialist: null,
    urgentCare: null,
    emergencyRoom: null,
    prescriptions: null,
    hsa: hint.hsa,
    baseCentsByArea: { [input.area]: input.cents },
    source: input.source,
  };
}
