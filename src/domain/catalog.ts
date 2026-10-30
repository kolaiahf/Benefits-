import { loadBrand } from "../brand.js";
import type { AncillaryPlan, AreaFactor, MedicalPlan, Plan } from "./types.js";

/**
 * Illustrative portfolio. These are not filed carrier rates. An agency loads
 * its own base rates and area factors before a quote is presented as bindable.
 */
export function samplePlans(): Plan[] {
  const product = loadBrand().productName;
  const medicalCarrier = `${product} Sample Health`;
  const dentalCarrier = `${product} Sample Dental`;
  const visionCarrier = `${product} Sample Vision`;
  const medical: MedicalPlan[] = [
    {
      id: "med-bronze-hdhp",
      line: "medical",
      name: "Bronze HDHP 7000",
      carrier: medicalCarrier,
      metal: "bronze",
      planType: "HDHP",
      deductibleIndividualCents: 700_000,
      deductibleFamilyCents: 1_400_000,
      oopIndividualCents: 805_000,
      coinsurance: 0.4,
      pcpCopayCents: 0,
      specialistCopayCents: 0,
      rxGenericCents: 0,
      hsaEligible: true,
      baseRateCents: 42_000,
      actuarialValue: 0.64,
      rateBasis: "illustrative_sample",
    },
    {
      id: "med-silver-ppo",
      line: "medical",
      name: "Silver PPO 2500",
      carrier: medicalCarrier,
      metal: "silver",
      planType: "PPO",
      deductibleIndividualCents: 250_000,
      deductibleFamilyCents: 500_000,
      oopIndividualCents: 700_000,
      coinsurance: 0.3,
      pcpCopayCents: 3_500,
      specialistCopayCents: 7_000,
      rxGenericCents: 1_500,
      hsaEligible: false,
      baseRateCents: 56_000,
      actuarialValue: 0.72,
      rateBasis: "illustrative_sample",
    },
    {
      id: "med-gold-ppo",
      line: "medical",
      name: "Gold PPO 1000",
      carrier: medicalCarrier,
      metal: "gold",
      planType: "PPO",
      deductibleIndividualCents: 100_000,
      deductibleFamilyCents: 200_000,
      oopIndividualCents: 450_000,
      coinsurance: 0.2,
      pcpCopayCents: 2_500,
      specialistCopayCents: 5_000,
      rxGenericCents: 1_000,
      hsaEligible: false,
      baseRateCents: 69_000,
      actuarialValue: 0.82,
      rateBasis: "illustrative_sample",
    },
    {
      id: "med-platinum-ppo",
      line: "medical",
      name: "Platinum PPO 500",
      carrier: medicalCarrier,
      metal: "platinum",
      planType: "PPO",
      deductibleIndividualCents: 50_000,
      deductibleFamilyCents: 100_000,
      oopIndividualCents: 250_000,
      coinsurance: 0.1,
      pcpCopayCents: 1_500,
      specialistCopayCents: 3_000,
      rxGenericCents: 500,
      hsaEligible: false,
      baseRateCents: 82_000,
      actuarialValue: 0.9,
      rateBasis: "illustrative_sample",
    },
  ];
  const dental: AncillaryPlan[] = [
    {
      id: "dent-ppo-basic",
      line: "dental",
      name: "Dental PPO Basic",
      carrier: dentalCarrier,
      planType: "PPO",
      deductibleCents: 5_000,
      annualMaxCents: 100_000,
      preventive: "100% in network",
      summary: "Preventive covered in full. Basic services at 80% after the deductible.",
      tierRatesCents: {
        employee_only: 3_200,
        employee_spouse: 6_400,
        employee_children: 7_200,
        employee_family: 10_800,
      },
      richness: 0.55,
      rateBasis: "illustrative_sample",
    },
    {
      id: "dent-ppo-plus",
      line: "dental",
      name: "Dental PPO Plus",
      carrier: dentalCarrier,
      planType: "PPO",
      deductibleCents: 5_000,
      annualMaxCents: 200_000,
      preventive: "100% in network",
      summary: "Adds major services at 50% and a $1,500 orthodontia lifetime allowance.",
      tierRatesCents: {
        employee_only: 4_800,
        employee_spouse: 9_600,
        employee_children: 11_000,
        employee_family: 15_500,
      },
      richness: 0.78,
      rateBasis: "illustrative_sample",
    },
  ];
  const vision: AncillaryPlan[] = [
    {
      id: "vis-basic",
      line: "vision",
      name: "Vision Basic",
      carrier: visionCarrier,
      planType: "PPO",
      deductibleCents: 0,
      annualMaxCents: null,
      preventive: "$10 exam copay",
      summary: "$150 frame allowance and standard lenses covered once every 12 months.",
      tierRatesCents: {
        employee_only: 800,
        employee_spouse: 1_500,
        employee_children: 1_600,
        employee_family: 2_400,
      },
      richness: 0.5,
      rateBasis: "illustrative_sample",
    },
    {
      id: "vis-plus",
      line: "vision",
      name: "Vision Plus",
      carrier: visionCarrier,
      planType: "PPO",
      deductibleCents: 0,
      annualMaxCents: null,
      preventive: "$0 exam copay",
      summary: "$250 frame allowance, progressive lenses, and an extra contact lens allowance.",
      tierRatesCents: {
        employee_only: 1_400,
        employee_spouse: 2_600,
        employee_children: 2_800,
        employee_family: 4_200,
      },
      richness: 0.8,
      rateBasis: "illustrative_sample",
    },
  ];
  return [...medical, ...dental, ...vision];
}

/** Sample geographic factors. Not a state rating-area filing. */
export function sampleAreaFactors(): AreaFactor[] {
  const rows: Array<[string, string, string, number]> = [
    ["92101", "CA", "sample-ca-19", 1.05],
    ["94105", "CA", "sample-ca-4", 1.18],
    ["90012", "CA", "sample-ca-15", 1.12],
    ["10001", "NY", "sample-ny-4", 1.22],
    ["60601", "IL", "sample-il-1", 1.08],
    ["73301", "TX", "sample-tx-3", 0.96],
    ["98101", "WA", "sample-wa-1", 1.1],
  ];
  return rows.map(([zip, state, ratingArea, factor]) => ({
    zip,
    state,
    ratingArea,
    factor,
    source: "illustrative_sample" as const,
  }));
}
