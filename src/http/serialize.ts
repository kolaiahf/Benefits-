import type { CensusDraft } from "../domain/census.js";
import type { CensusMember, Contribution, QuoteResult, RatedPlan, Recommendation, Tier } from "../domain/types.js";

export function publicMember(member: CensusMember) {
  return {
    id: member.id,
    subscriber_id: member.subscriberId,
    relationship: member.relationship,
    first_name: member.firstName,
    last_name: member.lastName,
    date_of_birth: member.dateOfBirth,
    zip: member.zip,
    gender: member.gender,
    tobacco: member.tobacco,
    annual_salary_cents: member.annualSalaryCents,
    email: member.email,
    waived: member.waived,
  };
}

export function draftFromPublic(input: {
  subscriber_id: string;
  relationship: CensusDraft["relationship"];
  first_name: string;
  last_name: string;
  date_of_birth: string;
  zip: string;
  gender?: CensusDraft["gender"];
  tobacco?: boolean;
  annual_salary_cents?: number | null;
  email?: string | null;
  waived?: boolean;
}): CensusDraft {
  return {
    subscriberId: input.subscriber_id,
    relationship: input.relationship,
    firstName: input.first_name,
    lastName: input.last_name,
    dateOfBirth: input.date_of_birth,
    zip: input.zip,
    gender: input.gender ?? "unknown",
    tobacco: input.tobacco ?? false,
    annualSalaryCents: input.annual_salary_cents ?? null,
    email: input.email ?? null,
    waived: input.waived ?? false,
  };
}

export function publicContribution(contribution: Contribution) {
  if (contribution.mode === "flat_per_employee") {
    return { mode: contribution.mode, amount_cents: contribution.amountCents };
  }
  return { mode: contribution.mode, employer_percent: contribution.employerPercent };
}

export function publicPlan(plan: RatedPlan) {
  return {
    plan_id: plan.planId,
    line: plan.line,
    name: plan.name,
    carrier: plan.carrier,
    rate_basis: plan.rateBasis,
    monthly_premium_cents: plan.monthlyPremiumCents,
    annual_premium_cents: plan.annualPremiumCents,
    employer_monthly_cents: plan.employerMonthlyCents,
    employee_monthly_cents: plan.employeeMonthlyCents,
    pepm_cents: plan.pepmCents,
    highlights: {
      plan_type: plan.highlights.planType,
      metal: plan.highlights.metal ?? null,
      deductible_individual_cents: plan.highlights.deductibleIndividualCents ?? null,
      oop_individual_cents: plan.highlights.oopIndividualCents ?? null,
      coinsurance: plan.highlights.coinsurance ?? null,
      pcp_copay_cents: plan.highlights.pcpCopayCents ?? null,
      hsa_eligible: plan.highlights.hsaEligible ?? false,
      annual_max_cents: plan.highlights.annualMaxCents ?? null,
      preventive: plan.highlights.preventive ?? null,
    },
    composite_by_tier: Object.fromEntries(
      Object.entries(plan.compositeByTier).map(([tier, value]) => [
        tier,
        { households: value.households, average_monthly_cents: value.averageMonthlyCents },
      ]),
    ) as Record<Tier, { households: number; average_monthly_cents: number }>,
    warnings: plan.warnings,
    households: plan.households.map((household) => ({
      subscriber_id: household.subscriberId,
      name: household.name,
      tier: household.tier,
      monthly_premium_cents: household.monthlyPremiumCents,
      employer_cents: household.employerCents,
      employee_cents: household.employeeCents,
      members: household.members.map((member) => ({
        census_id: member.censusId,
        name: member.name,
        relationship: member.relationship,
        age: member.age,
        monthly_cents: member.monthlyCents,
        capped: member.capped,
        factors: member.factors,
      })),
    })),
  };
}

export function publicRecommendation(recommendation: Recommendation) {
  return {
    prioritize: recommendation.prioritize,
    within_budget: recommendation.withinBudget,
    combined: {
      employer_monthly_cents: recommendation.combined.employerMonthlyCents,
      employee_monthly_cents: recommendation.combined.employeeMonthlyCents,
      monthly_premium_cents: recommendation.combined.monthlyPremiumCents,
      annual_employer_cents: recommendation.combined.annualEmployerCents,
    },
    selections: recommendation.selections.map((selection) => ({
      line: selection.line,
      plan_id: selection.planId,
      name: selection.name,
      carrier: selection.carrier,
      score: selection.score,
      employer_monthly_cents: selection.employerMonthlyCents,
      employee_monthly_cents: selection.employeeMonthlyCents,
      monthly_premium_cents: selection.monthlyPremiumCents,
      reasons: selection.reasons,
    })),
    narrative: recommendation.narrative,
  };
}

export function publicQuoteDocument(input: {
  id: string;
  groupId: string;
  createdAt: string;
  result: QuoteResult;
  recommendation: Recommendation;
}) {
  return {
    id: input.id,
    group_id: input.groupId,
    created_at: input.createdAt,
    effective_date: input.result.effectiveDate,
    contribution: publicContribution(input.result.contribution),
    enrolled_employees: input.result.enrolledEmployees,
    eligible_employees: input.result.eligibleEmployees,
    participation: input.result.participation,
    small_group_max: input.result.smallGroupMax,
    illustrative: input.result.plans.some((plan) => plan.rateBasis === "illustrative_sample"),
    methodology: input.result.methodology,
    warnings: input.result.warnings,
    plans: input.result.plans.map(publicPlan),
    recommendation: publicRecommendation(input.recommendation),
  };
}

export type PublicQuote = ReturnType<typeof publicQuoteDocument>;

export function quoteCsv(quote: PublicQuote): string {
  const selected = new Set(quote.recommendation.selections.map((selection) => selection.plan_id));
  const header = [
    "line",
    "plan_id",
    "plan",
    "carrier",
    "recommended",
    "monthly_premium",
    "employer_monthly",
    "employee_monthly",
    "pepm",
    "rate_basis",
  ];
  const lines = quote.plans.map((plan) =>
    [
      plan.line,
      plan.plan_id,
      csvCell(plan.name),
      csvCell(plan.carrier),
      selected.has(plan.plan_id) ? "yes" : "no",
      money(plan.monthly_premium_cents),
      money(plan.employer_monthly_cents),
      money(plan.employee_monthly_cents),
      money(plan.pepm_cents),
      plan.rate_basis,
    ].join(","),
  );
  return [header.join(","), ...lines].join("\n") + "\n";
}

function money(cents: number): string {
  return (cents / 100).toFixed(2);
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
