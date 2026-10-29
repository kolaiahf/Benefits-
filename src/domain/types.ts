export const LINES = ["medical", "dental", "vision"] as const;
export type Line = (typeof LINES)[number];

export const RELATIONSHIPS = ["self", "spouse", "child"] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export const TIERS = [
  "employee_only",
  "employee_spouse",
  "employee_children",
  "employee_family",
] as const;
export type Tier = (typeof TIERS)[number];

export const METALS = ["bronze", "silver", "gold", "platinum"] as const;
export type Metal = (typeof METALS)[number];

export type RateBasis = "illustrative_sample" | "agency_loaded";

export interface CensusMember {
  id: string;
  subscriberId: string;
  relationship: Relationship;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  zip: string;
  gender: "female" | "male" | "unknown";
  tobacco: boolean;
  annualSalaryCents: number | null;
  email: string | null;
  waived: boolean;
}

export interface AreaFactor {
  zip: string;
  state: string;
  ratingArea: string;
  factor: number;
  source: RateBasis;
}

export interface MedicalPlan {
  id: string;
  line: "medical";
  name: string;
  carrier: string;
  metal: Metal;
  planType: "PPO" | "HMO" | "EPO" | "HDHP";
  deductibleIndividualCents: number;
  deductibleFamilyCents: number;
  oopIndividualCents: number;
  coinsurance: number;
  pcpCopayCents: number;
  specialistCopayCents: number;
  rxGenericCents: number;
  hsaEligible: boolean;
  /** Monthly premium at age 21, area factor 1, non-tobacco, in cents. */
  baseRateCents: number;
  actuarialValue: number;
  rateBasis: RateBasis;
}

export interface AncillaryPlan {
  id: string;
  line: "dental" | "vision";
  name: string;
  carrier: string;
  planType: string;
  deductibleCents: number;
  annualMaxCents: number | null;
  preventive: string;
  summary: string;
  tierRatesCents: Record<Tier, number>;
  richness: number;
  rateBasis: RateBasis;
}

export type Plan = MedicalPlan | AncillaryPlan;

export type Contribution =
  | { mode: "percent_of_premium"; employerPercent: number }
  | { mode: "percent_of_employee_only"; employerPercent: number }
  | { mode: "flat_per_employee"; amountCents: number };

export interface MemberRate {
  censusId: string;
  name: string;
  relationship: Relationship;
  age: number;
  monthlyCents: number;
  capped: boolean;
  factors: { age: number; area: number; tobacco: number };
}

export interface HouseholdRate {
  subscriberId: string;
  name: string;
  tier: Tier;
  monthlyPremiumCents: number;
  employerCents: number;
  employeeCents: number;
  members: MemberRate[];
}

export interface TierComposite {
  households: number;
  averageMonthlyCents: number;
}

export interface RatedPlan {
  planId: string;
  line: Line;
  name: string;
  carrier: string;
  rateBasis: RateBasis;
  monthlyPremiumCents: number;
  annualPremiumCents: number;
  employerMonthlyCents: number;
  employeeMonthlyCents: number;
  pepmCents: number;
  households: HouseholdRate[];
  compositeByTier: Record<Tier, TierComposite>;
  warnings: string[];
  highlights: {
    planType: string;
    metal?: Metal;
    deductibleIndividualCents?: number;
    oopIndividualCents?: number;
    coinsurance?: number;
    pcpCopayCents?: number;
    hsaEligible?: boolean;
    annualMaxCents?: number | null;
    preventive?: string;
  };
}

export interface QuoteWarning {
  code: string;
  message: string;
}

export interface QuoteResult {
  effectiveDate: string;
  contribution: Contribution;
  enrolledEmployees: number;
  eligibleEmployees: number;
  participation: number;
  smallGroupMax: number;
  methodology: {
    medical: string;
    ancillary: string;
    childCap: string;
    gender: string;
  };
  warnings: QuoteWarning[];
  plans: RatedPlan[];
}

export type Priority = "cost" | "balanced" | "richness";

export interface RecommendPreferences {
  prioritize: Priority;
  employerBudgetMonthlyCents?: number;
  hsaPreference?: boolean;
}

export interface LineSelection {
  line: Line;
  planId: string;
  name: string;
  carrier: string;
  score: number;
  employerMonthlyCents: number;
  employeeMonthlyCents: number;
  monthlyPremiumCents: number;
  reasons: string[];
}

export interface Recommendation {
  prioritize: Priority;
  selections: LineSelection[];
  combined: {
    employerMonthlyCents: number;
    employeeMonthlyCents: number;
    monthlyPremiumCents: number;
    annualEmployerCents: number;
  };
  withinBudget: boolean | null;
  narrative: { text: string; source: "template" | "model" };
}
