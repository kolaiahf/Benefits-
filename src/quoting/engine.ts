import { cappedChildIds, federalAgeFactor } from "../domain/age.js";
import { ageOn, roundCents } from "../domain/money.js";
import { coversLabel } from "./format.js";
import type { ContributionRule, RatedEmployee, RatedPerson, TierTotal } from "./types.js";

export const SMALL_GROUP_MAX = 100;

export interface RatingPerson {
  id: string;
  employeeId: string;
  name: string;
  relationship: "employee" | "spouse" | "child";
  dateOfBirth: string;
}

export interface PlanRating {
  monthlyCents: number;
  employerCents: number;
  employeeCents: number;
  employees: RatedEmployee[];
  tiers: TierTotal[];
}

const TIER_ORDER = ["Employee only", "Employee + spouse", "Employee + children", "Family"] as const;

export function memberMonthlyCents(baseCents: number, age: number): number {
  if (!Number.isInteger(baseCents) || baseCents < 0) {
    throw new Error("Base rate must be a non-negative whole number of cents");
  }
  return roundCents(baseCents * federalAgeFactor(age));
}

export function splitEmployerShare(
  contribution: ContributionRule,
  employeeOnlyCents: number,
  dependentCents: number,
): { employerCents: number; employeeCents: number } {
  const premium = employeeOnlyCents + dependentCents;
  const employer = roundCents(
    (employeeOnlyCents * contribution.employerEmployeePercent) / 100 +
      (dependentCents * contribution.employerDependentPercent) / 100,
  );
  const capped = Math.min(Math.max(employer, 0), premium);
  return { employerCents: capped, employeeCents: premium - capped };
}

export function ratePlan(input: {
  people: RatingPerson[];
  baseCents: number;
  effectiveDate: string;
  contribution: ContributionRule;
}): PlanRating {
  assertContribution(input.contribution);
  const byEmployee = new Map<string, RatingPerson[]>();
  for (const person of input.people) {
    const list = byEmployee.get(person.employeeId) ?? [];
    list.push(person);
    byEmployee.set(person.employeeId, list);
  }
  const employees: RatedEmployee[] = [];
  for (const [employeeId, household] of byEmployee) {
    const employee = household.find((person) => person.relationship === "employee");
    if (!employee) continue;
    const aged = household.map((person) => ({ person, age: ageOn(person.dateOfBirth, input.effectiveDate) }));
    const capped = cappedChildIds(
      aged
        .filter((entry) => entry.person.relationship === "child")
        .map((entry) => ({ id: entry.person.id, age: entry.age })),
    );
    const people: RatedPerson[] = aged.map(({ person, age }) => {
      const isCapped = capped.has(person.id);
      const ageFactor = federalAgeFactor(age);
      return {
        id: person.id,
        name: person.name,
        relationship: person.relationship,
        age,
        ageFactor,
        capped: isCapped,
        monthlyCents: isCapped ? 0 : memberMonthlyCents(input.baseCents, age),
      };
    });
    const monthlyCents = people.reduce((sum, person) => sum + person.monthlyCents, 0);
    const employeeOnly = people.find((person) => person.relationship === "employee")?.monthlyCents ?? 0;
    const split = splitEmployerShare(input.contribution, employeeOnly, monthlyCents - employeeOnly);
    const spouse = people.some((person) => person.relationship === "spouse");
    const children = people.filter((person) => person.relationship === "child");
    employees.push({
      employeeId,
      name: employee.name,
      ages: people.map((person) => person.age),
      covers: coversLabel(spouse, children.length),
      monthlyCents,
      employerCents: split.employerCents,
      employeeCents: split.employeeCents,
      people,
    });
  }
  employees.sort((a, b) => a.name.localeCompare(b.name));
  const monthlyCents = employees.reduce((sum, row) => sum + row.monthlyCents, 0);
  const employerCents = employees.reduce((sum, row) => sum + row.employerCents, 0);
  const employeeCents = employees.reduce((sum, row) => sum + row.employeeCents, 0);
  return { monthlyCents, employerCents, employeeCents, employees, tiers: tierTotals(employees) };
}

function tierTotals(employees: RatedEmployee[]): TierTotal[] {
  return TIER_ORDER.map((tier) => {
    const rows = employees.filter((row) => tierName(row) === tier);
    return {
      tier,
      enrolled: rows.length,
      totalCents: rows.reduce((sum, row) => sum + row.monthlyCents, 0),
      employerCents: rows.reduce((sum, row) => sum + row.employerCents, 0),
      employeeCents: rows.reduce((sum, row) => sum + row.employeeCents, 0),
    };
  });
}

function tierName(row: RatedEmployee): (typeof TIER_ORDER)[number] {
  const spouse = row.people.some((person) => person.relationship === "spouse");
  const children = row.people.some((person) => person.relationship === "child");
  if (spouse && children) return "Family";
  if (spouse) return "Employee + spouse";
  if (children) return "Employee + children";
  return "Employee only";
}

function assertContribution(contribution: ContributionRule): void {
  for (const value of [contribution.employerEmployeePercent, contribution.employerDependentPercent]) {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error("Employer contribution percents must be between 0 and 100");
    }
  }
}
