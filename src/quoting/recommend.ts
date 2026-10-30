import type { Metal, Network } from "./types.js";

export function recommendPlan(plans: Array<{ id: string; metal: Metal; network: Network; monthlyCents: number }>): {
  id: string;
  rationale: string;
} {
  if (!plans.length) throw new Error("No plans to recommend");
  const gold = plans.filter((plan) => plan.metal === "gold");
  const pool = gold.length ? gold : plans;
  const ppo = pool.filter((plan) => plan.network === "PPO");
  const set = ppo.length ? ppo : pool;
  const sorted = [...set].sort((a, b) => a.monthlyCents - b.monthlyCents || a.id.localeCompare(b.id));
  const pick = sorted[Math.floor((sorted.length - 1) / 2)];
  const metal = pick.metal[0].toUpperCase() + pick.metal.slice(1);
  return {
    id: pick.id,
    rationale: `A ${metal} ${pick.network} near the middle of the plans on file for this rating area, so the monthly cost stays close to the other options. (Example rationale.)`,
  };
}
