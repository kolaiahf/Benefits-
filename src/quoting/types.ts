export const QUOTE_DISCLAIMER = "[Disclaimer text - needs legal review]";

export const METALS = ["bronze", "silver", "gold", "platinum"] as const;
export type Metal = (typeof METALS)[number];

export const NETWORKS = ["HMO", "PPO", "EPO", "POS"] as const;
export type Network = (typeof NETWORKS)[number];

export interface CatalogPlan {
  id: string;
  carrierId: string;
  carrierName: string;
  periodId: string;
  periodLabel: string;
  effectiveStart: string;
  effectiveEnd: string;
  name: string;
  metal: Metal;
  network: Network;
  deductibleCents: number | null;
  oopMaxCents: number | null;
  coinsurancePercent: number | null;
  primaryCare: string | null;
  specialist: string | null;
  urgentCare: string | null;
  emergencyRoom: string | null;
  prescriptions: string | null;
  hsa: boolean;
  /** Rating area ("1"–"19") → age-21 monthly premium in cents. Member rates are this base × the federal age factor. */
  baseCentsByArea: Record<string, number>;
  source: string;
}

export interface CatalogFile {
  generatedAt: string;
  notes: string[];
  plans: CatalogPlan[];
}

export interface ContributionRule {
  employerEmployeePercent: number;
  employerDependentPercent: number;
}

export interface CensusPerson {
  id: string;
  employeeId: string;
  name: string;
  relationship: "employee" | "spouse" | "child";
  dateOfBirth: string;
  zip: string;
}

export interface RatedPerson {
  id: string;
  name: string;
  relationship: "employee" | "spouse" | "child";
  age: number;
  monthlyCents: number;
  capped: boolean;
  ageFactor: number;
}

export interface TierTotal {
  tier: string;
  enrolled: number;
  totalCents: number;
  employerCents: number;
  employeeCents: number;
}

export interface RatedEmployee {
  employeeId: string;
  name: string;
  ages: number[];
  covers: string;
  monthlyCents: number;
  employerCents: number;
  employeeCents: number;
  people: RatedPerson[];
}

export interface RatedPlanQuote {
  planId: string;
  carrierName: string;
  planName: string;
  metal: Metal;
  network: Network;
  deductibleCents: number | null;
  oopMaxCents: number | null;
  coinsurancePercent: number | null;
  primaryCare: string | null;
  specialist: string | null;
  urgentCare: string | null;
  emergencyRoom: string | null;
  prescriptions: string | null;
  hsa: boolean;
  periodLabel: string;
  source: string;
  monthlyCents: number;
  employerCents: number;
  employeeCents: number;
  employees: RatedEmployee[];
  tiers: TierTotal[];
}

export interface QuoteDocument {
  id: string;
  employerName: string;
  employerZip: string;
  ratingArea: string;
  effectiveDate: string;
  employeeCount: number;
  preparedBy: { name: string; email: string };
  preparedOn: string;
  contribution: ContributionRule;
  disclaimer: string;
  rationale: string;
  currentPlanId: string | null;
  renewalIncreasePercent: number | null;
  /** Renewal monthly premium, when a current plan and an increase are both set. */
  renewalMonthlyCents: number | null;
  recommendedPlanId: string;
  plans: RatedPlanQuote[];
  notes: string[];
  warnings: string[];
}
