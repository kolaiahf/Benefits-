import { cappedChildIds, federalAgeFactor } from "./age.js";
import { groupHouseholds, householdTier, memberAge } from "./census.js";
import { roundCents } from "./money.js";
import type {
  AncillaryPlan,
  AreaFactor,
  CensusMember,
  Contribution,
  HouseholdRate,
  MedicalPlan,
  Plan,
  QuoteResult,
  QuoteWarning,
  RatedPlan,
  Tier,
  TierComposite,
} from "./types.js";
import { TIERS } from "./types.js";

const SMALL_GROUP_MAX = 50;
const PARTICIPATION_FLOOR = 0.75;

export interface RateInput {
  members: CensusMember[];
  plans: Plan[];
  areas: AreaFactor[];
  effectiveDate: string;
  contribution: Contribution;
  smallGroupMax?: number;
}

export function rateQuote(input: RateInput): QuoteResult {
  const smallGroupMax = input.smallGroupMax ?? SMALL_GROUP_MAX;
  const eligible = input.members.filter((member) => member.relationship === "self");
  const enrolled = eligible.filter((member) => !member.waived);
  const warnings: QuoteWarning[] = [];
  if (enrolled.length === 0) {
    throw new Error("Quote needs at least one enrolled employee");
  }
  if (eligible.length > smallGroupMax) {
    warnings.push({
      code: "above_small_group",
      message: `${eligible.length} eligible employees exceeds the small-group maximum of ${smallGroupMax}.`,
    });
  }
  const participation = enrolled.length / eligible.length;
  if (participation < PARTICIPATION_FLOOR) {
    warnings.push({
      code: "low_participation",
      message: `Medical participation is ${Math.round(participation * 100)}%. Many carriers require about 75%.`,
    });
  }
  const areaByZip = new Map(input.areas.map((area) => [area.zip, area]));
  const plans = input.plans.map((plan) => ratePlan(plan, input.members, areaByZip, input.effectiveDate, input.contribution));
  return {
    effectiveDate: input.effectiveDate,
    contribution: input.contribution,
    enrolledEmployees: enrolled.length,
    eligibleEmployees: eligible.length,
    participation,
    smallGroupMax,
    methodology: {
      medical:
        "Member-level age rating on the federal default age curve. Each member premium is base rate × age factor × area factor × tobacco factor, rounded to the cent, then summed.",
      ancillary:
        "Composite four-tier rates (employee, employee+spouse, employee+children, family), multiplied by the ZIP area factor and rounded to the cent.",
      childCap:
        "Within each family, at most the three oldest covered children under 21 are billed, per 45 CFR 147.102.",
      gender: "Gender is stored on the census and is not a rating factor.",
    },
    warnings,
    plans,
  };
}

function ratePlan(
  plan: Plan,
  members: CensusMember[],
  areas: Map<string, AreaFactor>,
  effectiveDate: string,
  contribution: Contribution,
): RatedPlan {
  const households = [...groupHouseholds(members).values()]
    .map((household) =>
      plan.line === "medical"
        ? rateMedicalHousehold(plan, household, areas, effectiveDate, contribution)
        : rateAncillaryHousehold(plan, household, areas, contribution),
    )
    .filter((household): household is HouseholdRate => household !== null);

  const monthlyPremiumCents = households.reduce((sum, household) => sum + household.monthlyPremiumCents, 0);
  const employerMonthlyCents = households.reduce((sum, household) => sum + household.employerCents, 0);
  const employeeMonthlyCents = households.reduce((sum, household) => sum + household.employeeCents, 0);
  const enrolledCount = households.length;
  const warnings: string[] = [];
  const unknownZips = new Set<string>();
  for (const member of members) {
    if (!member.waived && !areas.has(member.zip)) unknownZips.add(member.zip);
  }
  for (const zip of unknownZips) {
    warnings.push(`ZIP ${zip} is not in the area table. Area factor 1.00 was used.`);
  }

  return {
    planId: plan.id,
    line: plan.line,
    name: plan.name,
    carrier: plan.carrier,
    rateBasis: plan.rateBasis,
    monthlyPremiumCents,
    annualPremiumCents: monthlyPremiumCents * 12,
    employerMonthlyCents,
    employeeMonthlyCents,
    pepmCents: enrolledCount ? roundCents(monthlyPremiumCents / enrolledCount) : 0,
    households,
    compositeByTier: composite(households),
    warnings: [...new Set(warnings)],
    highlights:
      plan.line === "medical"
        ? {
            planType: plan.planType,
            metal: plan.metal,
            deductibleIndividualCents: plan.deductibleIndividualCents,
            oopIndividualCents: plan.oopIndividualCents,
            coinsurance: plan.coinsurance,
            pcpCopayCents: plan.pcpCopayCents,
            hsaEligible: plan.hsaEligible,
          }
        : {
            planType: plan.planType,
            deductibleIndividualCents: plan.deductibleCents,
            annualMaxCents: plan.annualMaxCents,
            preventive: plan.preventive,
          },
  };
}

function rateMedicalHousehold(
  plan: MedicalPlan,
  household: CensusMember[],
  areas: Map<string, AreaFactor>,
  effectiveDate: string,
  contribution: Contribution,
): HouseholdRate | null {
  const tier = householdTier(household);
  if (!tier) return null;
  const subscriber = household.find((member) => member.relationship === "self");
  if (!subscriber) return null;
  const covered = household.filter((member) => !member.waived);
  const ages = covered.map((member) => ({ member, age: memberAge(member, effectiveDate) }));
  const capped = cappedChildIds(
    ages
      .filter((entry) => entry.member.relationship === "child")
      .map((entry) => ({ id: entry.member.id, age: entry.age })),
  );
  const members = ages.map(({ member, age }) => {
    const area = areaFactorFor(member.zip, areas);
    const tobacco = member.tobacco ? 1.5 : 1;
    const ageFactor = federalAgeFactor(age);
    const isCapped = capped.has(member.id);
    const monthlyCents = isCapped ? 0 : roundCents(plan.baseRateCents * ageFactor * area * tobacco);
    return {
      censusId: member.id,
      name: `${member.firstName} ${member.lastName}`,
      relationship: member.relationship,
      age,
      monthlyCents,
      capped: isCapped,
      factors: { age: ageFactor, area, tobacco },
    };
  });
  const monthlyPremiumCents = members.reduce((sum, member) => sum + member.monthlyCents, 0);
  const employeeOnly = members.find((member) => member.relationship === "self")?.monthlyCents ?? 0;
  const split = splitContribution(contribution, monthlyPremiumCents, employeeOnly);
  return {
    subscriberId: subscriber.subscriberId,
    name: `${subscriber.firstName} ${subscriber.lastName}`,
    tier,
    monthlyPremiumCents,
    employerCents: split.employerCents,
    employeeCents: split.employeeCents,
    members,
  };
}

function rateAncillaryHousehold(
  plan: AncillaryPlan,
  household: CensusMember[],
  areas: Map<string, AreaFactor>,
  contribution: Contribution,
): HouseholdRate | null {
  const tier = householdTier(household);
  if (!tier) return null;
  const subscriber = household.find((member) => member.relationship === "self");
  if (!subscriber) return null;
  const area = areaFactorFor(subscriber.zip, areas);
  const monthlyPremiumCents = roundCents(plan.tierRatesCents[tier] * area);
  const employeeOnly = roundCents(plan.tierRatesCents.employee_only * area);
  const split = splitContribution(contribution, monthlyPremiumCents, employeeOnly);
  const covered = household.filter((member) => !member.waived);
  return {
    subscriberId: subscriber.subscriberId,
    name: `${subscriber.firstName} ${subscriber.lastName}`,
    tier,
    monthlyPremiumCents,
    employerCents: split.employerCents,
    employeeCents: split.employeeCents,
    members: covered.map((member) => ({
      censusId: member.id,
      name: `${member.firstName} ${member.lastName}`,
      relationship: member.relationship,
      age: 0,
      monthlyCents: member.relationship === "self" ? monthlyPremiumCents : 0,
      capped: false,
      factors: { age: 1, area, tobacco: 1 },
    })),
  };
}

export function splitContribution(
  contribution: Contribution,
  premiumCents: number,
  employeeOnlyCents: number,
): { employerCents: number; employeeCents: number } {
  let employer = 0;
  if (contribution.mode === "percent_of_premium") {
    employer = roundCents((premiumCents * contribution.employerPercent) / 100);
  } else if (contribution.mode === "percent_of_employee_only") {
    employer = roundCents((employeeOnlyCents * contribution.employerPercent) / 100);
  } else {
    employer = contribution.amountCents;
  }
  employer = Math.min(Math.max(employer, 0), premiumCents);
  return { employerCents: employer, employeeCents: premiumCents - employer };
}

function areaFactorFor(zip: string, areas: Map<string, AreaFactor>): number {
  return areas.get(zip)?.factor ?? 1;
}

function composite(households: HouseholdRate[]): Record<Tier, TierComposite> {
  const result = {} as Record<Tier, TierComposite>;
  for (const tier of TIERS) {
    const matching = households.filter((household) => household.tier === tier);
    const total = matching.reduce((sum, household) => sum + household.monthlyPremiumCents, 0);
    result[tier] = {
      households: matching.length,
      averageMonthlyCents: matching.length ? roundCents(total / matching.length) : 0,
    };
  }
  return result;
}

export function isIllustrative(plans: RatedPlan[]): boolean {
  return plans.some((plan) => plan.rateBasis === "illustrative_sample");
}
