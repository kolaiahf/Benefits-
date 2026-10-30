import { parseIsoDate, roundCents } from "../domain/money.js";
import { ratePlan, SMALL_GROUP_MAX } from "./engine.js";
import { recommendPlan } from "./recommend.js";
import { ratingAreaForZip } from "./regions.js";
import { QUOTE_DISCLAIMER, type CatalogPlan, type ContributionRule, type QuoteDocument, type RatedPlanQuote } from "./types.js";
import type { CensusPerson } from "./types.js";

export class QuoteInputError extends Error {
  constructor(message: string, readonly issues: string[] = [message]) {
    super(message);
    this.name = "QuoteInputError";
  }
}

export function plansForQuote(catalog: CatalogPlan[], area: string, effectiveDate: string): CatalogPlan[] {
  return catalog.filter(
    (plan) =>
      plan.effectiveStart <= effectiveDate &&
      effectiveDate <= plan.effectiveEnd &&
      plan.baseCentsByArea[area] !== undefined,
  );
}

export function buildQuoteDocument(input: {
  id: string;
  employerName: string;
  employerZip: string;
  effectiveDate: string;
  people: CensusPerson[];
  contribution: ContributionRule;
  currentPlanId?: string | null;
  renewalIncreasePercent?: number | null;
  preparedBy: { name: string; email: string };
  preparedOn: string;
  catalog: CatalogPlan[];
  catalogNotes?: string[];
  warnings?: string[];
}): QuoteDocument {
  const name = input.employerName.trim();
  if (!name || name.length > 160) throw new QuoteInputError("Enter the employer name.");
  parseIsoDate(input.effectiveDate);
  const zip = input.employerZip.trim().slice(0, 5);
  if (!/^\d{5}$/.test(zip)) throw new QuoteInputError("Employer ZIP must be 5 digits.");
  const area = ratingAreaForZip(zip);
  if (!area) throw new QuoteInputError(`ZIP ${zip} is not in the California rating-area list.`);
  const employees = input.people.filter((person) => person.relationship === "employee");
  if (employees.length < 1 || employees.length > SMALL_GROUP_MAX) {
    throw new QuoteInputError(`A California small group here is 1 to ${SMALL_GROUP_MAX} employees.`);
  }
  const available = plansForQuote(input.catalog, area, input.effectiveDate);
  if (!available.length) {
    throw new QuoteInputError(
      `No loaded plans cover rating area ${area} on ${input.effectiveDate}. Pick a date inside a rate period on file, or another ZIP.`,
    );
  }
  const people = input.people.map((person) => ({
    id: person.id,
    employeeId: person.employeeId,
    name: person.name,
    relationship: person.relationship,
    dateOfBirth: person.dateOfBirth,
  }));
  const rated: RatedPlanQuote[] = available.map((plan) => {
    const result = ratePlan({
      people,
      baseCents: plan.baseCentsByArea[area],
      effectiveDate: input.effectiveDate,
      contribution: input.contribution,
    });
    return {
      planId: plan.id,
      carrierName: plan.carrierName,
      planName: plan.name,
      metal: plan.metal,
      network: plan.network,
      deductibleCents: plan.deductibleCents,
      oopMaxCents: plan.oopMaxCents,
      coinsurancePercent: plan.coinsurancePercent,
      primaryCare: plan.primaryCare,
      specialist: plan.specialist,
      urgentCare: plan.urgentCare,
      emergencyRoom: plan.emergencyRoom,
      prescriptions: plan.prescriptions,
      hsa: plan.hsa,
      periodLabel: plan.periodLabel,
      source: plan.source,
      ...result,
    };
  });
  const recommendation = recommendPlan(rated.map((plan) => ({
    id: plan.planId,
    metal: plan.metal,
    network: plan.network,
    monthlyCents: plan.monthlyCents,
  })));
  const current = input.currentPlanId && rated.some((plan) => plan.planId === input.currentPlanId) ? input.currentPlanId : null;
  const increase = input.renewalIncreasePercent;
  let renewalMonthlyCents: number | null = null;
  if (current && increase != null && Number.isFinite(increase)) {
    if (increase < -50 || increase > 100) throw new QuoteInputError("Renewal increase must be between -50% and 100%.");
    const currentPlan = rated.find((plan) => plan.planId === current);
    if (currentPlan) renewalMonthlyCents = roundCents(currentPlan.monthlyCents * (1 + increase / 100));
  }
  const sorted = [...rated].sort((a, b) => {
    if (a.planId === recommendation.id) return -1;
    if (b.planId === recommendation.id) return 1;
    const rec = rated.find((plan) => plan.planId === recommendation.id)?.monthlyCents ?? 0;
    return Math.abs(a.monthlyCents - rec) - Math.abs(b.monthlyCents - rec) || a.monthlyCents - b.monthlyCents;
  });
  return {
    id: input.id,
    employerName: name,
    employerZip: zip,
    ratingArea: area,
    effectiveDate: input.effectiveDate,
    employeeCount: employees.length,
    preparedBy: input.preparedBy,
    preparedOn: input.preparedOn,
    contribution: input.contribution,
    disclaimer: QUOTE_DISCLAIMER,
    rationale: recommendation.rationale,
    currentPlanId: current,
    renewalIncreasePercent: renewalMonthlyCents != null ? increase ?? null : null,
    renewalMonthlyCents,
    recommendedPlanId: recommendation.id,
    plans: sorted,
    notes: input.catalogNotes ?? [],
    warnings: input.warnings ?? [],
  };
}
