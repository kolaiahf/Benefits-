import type { Metal, Network } from "../../quoting/types.js";

export interface BenefitHint {
  metal: Metal | null;
  network: Network | null;
  deductibleCents: number | null;
  coinsurancePercent: number | null;
  primaryCare: string | null;
  hsa: boolean;
}

export function benefitsFromName(name: string): BenefitHint {
  const hsa = /hdhp|hsa/i.test(name);
  const metal = metalOf(name);
  const network = networkOf(name);
  const percent = /(\d{2,5})\s*\/\s*(\d{1,3})\s*%/.exec(name);
  if (percent) {
    return {
      metal,
      network,
      deductibleCents: Number(percent[1]) * 100,
      coinsurancePercent: Number(percent[2]),
      primaryCare: hsa ? "After ded." : null,
      hsa,
    };
  }
  const pair = /(\d{1,5})\s*\/\s*(\d{1,3})(?!\d)/.exec(name);
  if (pair) {
    const deductible = Number(pair[1]);
    const second = Number(pair[2]);
    return {
      metal,
      network,
      deductibleCents: deductible * 100,
      coinsurancePercent: null,
      primaryCare: hsa ? "After ded." : `$${second.toLocaleString("en-US")}`,
      hsa,
    };
  }
  return { metal, network, deductibleCents: null, coinsurancePercent: null, primaryCare: hsa ? "After ded." : null, hsa };
}

export function metalOf(name: string): Metal | null {
  if (/platinum/i.test(name)) return "platinum";
  if (/gold/i.test(name)) return "gold";
  if (/silver/i.test(name)) return "silver";
  if (/bronze/i.test(name)) return "bronze";
  return null;
}

export function networkOf(name: string): Network | null {
  if (/HMO/i.test(name)) return "HMO";
  if (/EPO/i.test(name)) return "EPO";
  if (/POS/i.test(name)) return "POS";
  if (/PPO/i.test(name)) return "PPO";
  return null;
}

export function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90);
}

export function dollarsToCents(token: string): number {
  return Math.round(Number(token.replace(/[$,]/g, "")) * 100);
}
