import { formatUsd } from "./money.js";
import type {
  Line,
  LineSelection,
  Priority,
  RatedPlan,
  Recommendation,
  RecommendPreferences,
} from "./types.js";
import { LINES } from "./types.js";

export function recommendPlans(plans: RatedPlan[], preferences: RecommendPreferences): Recommendation {
  const selections = LINES.flatMap((line) => {
    const peers = plans.filter((plan) => plan.line === line);
    if (!peers.length) return [];
    return [selectLine(line, peers, preferences, plans)];
  });
  const combined = selections.reduce(
    (sum, selection) => ({
      employerMonthlyCents: sum.employerMonthlyCents + selection.employerMonthlyCents,
      employeeMonthlyCents: sum.employeeMonthlyCents + selection.employeeMonthlyCents,
      monthlyPremiumCents: sum.monthlyPremiumCents + selection.monthlyPremiumCents,
    }),
    { employerMonthlyCents: 0, employeeMonthlyCents: 0, monthlyPremiumCents: 0 },
  );
  const withinBudget =
    preferences.employerBudgetMonthlyCents === undefined
      ? null
      : combined.employerMonthlyCents <= preferences.employerBudgetMonthlyCents;
  const recommendation: Recommendation = {
    prioritize: preferences.prioritize,
    selections,
    combined: {
      ...combined,
      annualEmployerCents: combined.employerMonthlyCents * 12,
    },
    withinBudget,
    narrative: { text: "", source: "template" },
  };
  recommendation.narrative = { text: templateNarrative(recommendation, preferences), source: "template" };
  return recommendation;
}

function selectLine(
  line: Line,
  peers: RatedPlan[],
  preferences: RecommendPreferences,
  allPlans: RatedPlan[],
): LineSelection {
  const scored = peers.map((plan) => ({ plan, score: scorePlan(plan, peers, preferences, allPlans) }));
  scored.sort((a, b) => b.score - a.score || a.plan.monthlyPremiumCents - b.plan.monthlyPremiumCents);
  const winner = scored[0];
  const runnerUp = scored[1];
  return {
    line,
    planId: winner.plan.planId,
    name: winner.plan.name,
    carrier: winner.plan.carrier,
    score: roundScore(winner.score),
    employerMonthlyCents: winner.plan.employerMonthlyCents,
    employeeMonthlyCents: winner.plan.employeeMonthlyCents,
    monthlyPremiumCents: winner.plan.monthlyPremiumCents,
    reasons: reasonsFor(winner.plan, runnerUp?.plan, preferences),
  };
}

function scorePlan(
  plan: RatedPlan,
  peers: RatedPlan[],
  preferences: RecommendPreferences,
  allPlans: RatedPlan[],
): number {
  const maxEmployee = Math.max(...peers.map((peer) => peer.employeeMonthlyCents), 1);
  const employeeScore = 1 - plan.employeeMonthlyCents / maxEmployee;
  const budget = preferences.employerBudgetMonthlyCents;
  const lineCount = new Set(allPlans.map((peer) => peer.line)).size || 1;
  const lineBudget = budget && budget > 0 ? budget / lineCount : 0;
  // Without a budget, employer-cost is not a second copy of the employee-cost score.
  const budgetScore =
    lineBudget > 0
      ? 1 - Math.min(1, Math.abs(plan.employerMonthlyCents - lineBudget) / lineBudget)
      : 0.5;
  const richness = richnessOf(plan);
  const weights = weightsFor(preferences.prioritize);
  let score = weights.cost * employeeScore + weights.budget * budgetScore + weights.rich * richness;
  if (preferences.hsaPreference && plan.highlights.hsaEligible) score += 0.05;
  return score;
}

function richnessOf(plan: RatedPlan): number {
  if (plan.line === "medical") {
  const deductible = plan.highlights.deductibleIndividualCents ?? 0;
  const oop = plan.highlights.oopIndividualCents;
  const deductibleScore = 1 - Math.min(deductible, 800_000) / 800_000;
  if (oop === undefined) return deductibleScore;
  const oopScore = 1 - Math.min(oop, 1_000_000) / 1_000_000;
  return deductibleScore * 0.6 + oopScore * 0.4;
  }
  const annualMax = plan.highlights.annualMaxCents ?? 100_000;
  return Math.min(annualMax, 300_000) / 300_000;
}

function weightsFor(priority: Priority): { cost: number; budget: number; rich: number } {
  if (priority === "cost") return { cost: 0.7, budget: 0.2, rich: 0.1 };
  if (priority === "richness") return { cost: 0.15, budget: 0.15, rich: 0.7 };
  return { cost: 0.4, budget: 0.3, rich: 0.3 };
}

function reasonsFor(plan: RatedPlan, alternative: RatedPlan | undefined, preferences: RecommendPreferences): string[] {
  const reasons = [
    `${plan.name} prices the census at ${formatUsd(plan.monthlyPremiumCents)} per month, ${formatUsd(plan.employerMonthlyCents)} from the employer and ${formatUsd(plan.employeeMonthlyCents)} from employees.`,
  ];
  if (alternative) {
    const delta = plan.employeeMonthlyCents - alternative.employeeMonthlyCents;
    if (delta < 0) {
      reasons.push(
        `Employees pay ${formatUsd(Math.abs(delta))} less per month than on ${alternative.name}.`,
      );
    } else if (delta > 0) {
      reasons.push(
        `Employees pay ${formatUsd(delta)} more per month than on ${alternative.name}, in exchange for the richer design.`,
      );
    }
  }
  if (plan.highlights.hsaEligible && preferences.hsaPreference) {
    reasons.push("The plan is HSA-eligible, which matches the group's preference.");
  }
  if (plan.highlights.deductibleIndividualCents !== undefined && plan.line === "medical" && plan.highlights.oopIndividualCents !== undefined) {
    reasons.push(
      `Individual deductible is ${formatUsd(plan.highlights.deductibleIndividualCents)} and the out-of-pocket maximum is ${formatUsd(plan.highlights.oopIndividualCents)}.`,
    );
  } else if (plan.highlights.deductibleIndividualCents !== undefined && plan.line === "medical") {
    reasons.push(`The plan name publishes an individual deductible of ${formatUsd(plan.highlights.deductibleIndividualCents)}.`);
  }
  if (plan.rateBasis === "illustrative_sample") {
    reasons.push("These rates are illustrative sample tables, not a carrier filing.");
  }
  return reasons;
}

export function templateNarrative(recommendation: Recommendation, preferences: RecommendPreferences): string {
  if (!recommendation.selections.length) {
    return "No plans were quoted, so there is no recommendation yet.";
  }
  const named = recommendation.selections
    .map((selection) => `${selection.name} for ${selection.line}`)
    .join(", ")
    .replace(/, ([^,]*)$/, ", and $1");
  const budget =
    preferences.employerBudgetMonthlyCents === undefined
      ? ""
      : recommendation.withinBudget
        ? ` The portfolio is inside the ${formatUsd(preferences.employerBudgetMonthlyCents)} monthly employer budget.`
        : ` The portfolio is above the ${formatUsd(preferences.employerBudgetMonthlyCents)} monthly employer budget.`;
  const detail = recommendation.selections
    .map((selection) => selection.reasons[0])
    .join(" ");
  return `Recommend ${named}. Combined monthly premium is ${formatUsd(recommendation.combined.monthlyPremiumCents)}, of which the employer pays ${formatUsd(recommendation.combined.employerMonthlyCents)} (${formatUsd(recommendation.combined.annualEmployerCents)} per year) and employees pay ${formatUsd(recommendation.combined.employeeMonthlyCents)}.${budget} ${detail}`.trim();
}

export function narrativeKeepsSourceNumbers(text: string, recommendation: Recommendation): boolean {
  const allowed = new Set<string>();
  const amounts = [
    recommendation.combined.monthlyPremiumCents,
    recommendation.combined.employerMonthlyCents,
    recommendation.combined.employeeMonthlyCents,
    recommendation.combined.annualEmployerCents,
    ...recommendation.selections.flatMap((selection) => [
      selection.monthlyPremiumCents,
      selection.employerMonthlyCents,
      selection.employeeMonthlyCents,
    ]),
  ];
  for (const cents of amounts) allowed.add(normalizeMoney(formatUsd(cents)));
  const mentioned = text.match(/\$\d[\d,]*(?:\.\d{2})?/g) ?? [];
  return mentioned.every((token) => allowed.has(normalizeMoney(token)));
}

function normalizeMoney(token: string): string {
  return token.replace(/[$,]/g, "");
}

function roundScore(score: number): number {
  return Math.round(score * 1000) / 1000;
}
