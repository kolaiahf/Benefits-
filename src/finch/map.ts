import type { CensusDraft } from "../domain/census.js";
import { annualSalaryCents, type FinchDependent, type FinchDirectoryPerson, type FinchEmployment, type FinchEnrollment, type FinchIndividual, type FinchPlan } from "./client.js";

export interface CurrentBenefit {
  line: "medical" | "dental" | "vision" | "other";
  planId: string;
  name: string;
  carrier: string | null;
  enrolled: number;
  employeeContributionCents: number | null;
  employerContributionCents: number | null;
}

export interface FinchCensusResult {
  members: CensusDraft[];
  benefits: CurrentBenefit[];
  warnings: string[];
}

const LINE_BY_TYPE: Record<string, CurrentBenefit["line"]> = {
  medical: "medical",
  dental: "dental",
  vision: "vision",
  s125_medical: "medical",
  s125_dental: "dental",
  s125_vision: "vision",
  hsa_pre: "medical",
  hsa: "medical",
};

export function censusFromFinch(input: {
  directory: FinchDirectoryPerson[];
  individuals: FinchIndividual[];
  employment: FinchEmployment[];
  plans: FinchPlan[];
  enrollments: FinchEnrollment[];
  dependents: FinchDependent[];
  fallbackZip: string;
}): FinchCensusResult {
  const warnings: string[] = [];
  const individualById = new Map(input.individuals.map((person) => [person.id, person]));
  const employmentById = new Map(input.employment.map((job) => [job.id, job]));
  const active = input.directory.filter((person) => person.isActive);
  if (!active.length) warnings.push("Finch directory returned no active employees.");

  const members: CensusDraft[] = [];
  for (const person of active) {
    const detail = individualById.get(person.id);
    const job = employmentById.get(person.id);
    const dob = detail?.dob ?? null;
    if (!dob) {
      warnings.push(`Skipped ${person.firstName} ${person.lastName} because Finch did not return a date of birth.`);
      continue;
    }
    const zip = detail?.postalCode ?? input.fallbackZip;
    if (!detail?.postalCode) {
      warnings.push(`Used the group ZIP for ${person.firstName} ${person.lastName} because residence ZIP was missing.`);
    }
    members.push({
      subscriberId: person.id,
      relationship: "self",
      firstName: detail?.firstName || person.firstName || "Employee",
      lastName: detail?.lastName || person.lastName || "Unknown",
      dateOfBirth: dob,
      zip,
      gender: normalizeGender(detail?.gender),
      tobacco: false,
      annualSalaryCents: annualSalaryCents(job?.income ?? null),
      email: detail?.email ?? null,
      waived: false,
    });
  }

  const employeeIds = new Set(members.map((member) => member.subscriberId));
  const dependentsAdded = new Set<string>();
  for (const dependent of input.dependents) {
    if (!dependent.individualId || !employeeIds.has(dependent.individualId)) continue;
    if (!dependent.dob) {
      warnings.push(`Skipped a dependent of ${dependent.individualId} with no date of birth.`);
      continue;
    }
    const relationship = dependentRelationship(dependent.relationship);
    if (!relationship) {
      warnings.push(`Skipped dependent ${dependent.firstName} ${dependent.lastName} with relationship ${dependent.relationship ?? "unknown"}.`);
      continue;
    }
    const key = `${dependent.individualId}:${dependent.id}`;
    if (dependentsAdded.has(key)) continue;
    dependentsAdded.add(key);
    const subscriber = members.find((member) => member.subscriberId === dependent.individualId);
    members.push({
      subscriberId: dependent.individualId,
      relationship,
      firstName: dependent.firstName || "Dependent",
      lastName: dependent.lastName || subscriber?.lastName || "Unknown",
      dateOfBirth: dependent.dob,
      zip: subscriber?.zip ?? input.fallbackZip,
      gender: "unknown",
      tobacco: false,
      annualSalaryCents: null,
      email: null,
      waived: false,
    });
  }

  const planById = new Map(input.plans.map((plan) => [plan.id, plan]));
  const benefits = summarizeBenefits(input.plans, input.enrollments, planById);
  if (!input.plans.length) {
    warnings.push("Finch did not return benefit plans. Census was built from payroll only.");
  }
  return { members, benefits, warnings };
}

function summarizeBenefits(
  plans: FinchPlan[],
  enrollments: FinchEnrollment[],
  planById: Map<string, FinchPlan>,
): CurrentBenefit[] {
  const active = enrollments.filter((enrollment) => enrollment.status === null || enrollment.status === "active");
  const ids = new Set([...plans.map((plan) => plan.id), ...active.map((enrollment) => enrollment.planId)]);
  return [...ids].map((planId) => {
    const plan = planById.get(planId);
    const rows = active.filter((enrollment) => enrollment.planId === planId);
    const employee = rows.find((row) => row.employeeContributionCents !== null)?.employeeContributionCents ?? null;
    const employer = rows.find((row) => row.employerContributionCents !== null)?.employerContributionCents ?? null;
    return {
      line: LINE_BY_TYPE[(plan?.type ?? "other").toLowerCase()] ?? "other",
      planId,
      name: plan?.name ?? "Benefit plan",
      carrier: plan?.carrier ?? null,
      enrolled: rows.length,
      employeeContributionCents: employee,
      employerContributionCents: employer,
    };
  });
}

function normalizeGender(value: string | null | undefined): CensusDraft["gender"] {
  const normalized = (value ?? "").toLowerCase();
  if (normalized.startsWith("f")) return "female";
  if (normalized.startsWith("m")) return "male";
  return "unknown";
}

function dependentRelationship(value: string | null): "spouse" | "child" | null {
  const normalized = (value ?? "").toLowerCase();
  if (["spouse", "domestic_partner", "partner"].includes(normalized)) return "spouse";
  if (["child", "son", "daughter"].includes(normalized)) return "child";
  return null;
}
