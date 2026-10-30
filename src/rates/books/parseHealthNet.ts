import { dollarsToCents } from "./benefits.js";

/**
 * Health Net Q3 2026 PPO column order. The extracted text loses column alignment,
 * but every region page uses this same 17-plan sequence.
 */
export const HEALTH_NET_PPO_NAMES = [
  "Platinum PPO 0/15",
  "Platinum PPO 0/5",
  "Platinum PPO 250/15",
  "Gold PPO 350/25",
  "Gold PPO 0/35",
  "Gold PPO 500/20",
  "Gold PPO 1000/35",
  "Gold PPO 750/15",
  "Gold PPO 1500/20",
  "Gold HDHP PPO 1700/20%",
  "Silver PPO 2500/55",
  "Silver PPO 2250/60",
  "Silver PPO 1700/50",
  "Silver PPO 2500/50",
  "Silver HDHP PPO 1700/50%",
  "Bronze PPO 5800/60",
  "Bronze HDHP PPO 7200/0%",
] as const;

const MONEY = /\d{1,3}(?:,\d{3})*\.\d{2}/g;

export interface HealthNetRegionRates {
  region: string;
  age21Cents: number[];
}

export function parseHealthNetPpo(text: string): HealthNetRegionRates[] {
  const byRegion = new Map<string, number[]>();
  for (const page of text.split("\f")) {
    if (!page.includes("New and renewing")) continue;
    if (!page.includes("350/25") || !page.includes("1500/20") || !page.includes("7200/0%")) continue;
    if (/\bHMO\b/.test(page.slice(0, 400)) && !page.includes("PPO Rates")) continue;
    const region = /Region\s+(\d{1,2})/.exec(page);
    if (!region) continue;
    const area = String(Number(region[1]));
    if (Number(area) < 1 || Number(area) > 19) continue;
    const age21 = page.split(/\r?\n/).find((line) => /^\s*21\s/.test(line));
    if (!age21) continue;
    const amounts = [...age21.matchAll(MONEY)].map((match) => dollarsToCents(match[0]));
    if (amounts.length !== HEALTH_NET_PPO_NAMES.length) continue;
    if (!byRegion.has(area)) byRegion.set(area, amounts);
  }
  return [...byRegion.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([region, age21Cents]) => ({ region, age21Cents }));
}
