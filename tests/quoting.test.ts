import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cappedChildIds, federalAgeFactor } from "../src/domain/age.js";
import { sampleAreaFactors, samplePlans } from "../src/domain/catalog.js";
import { CensusError, parseCensusCsv } from "../src/domain/census.js";
import { ageOn } from "../src/domain/money.js";
import { recommendPlans } from "../src/domain/recommend.js";
import { rateQuote } from "../src/domain/rating.js";
import type { CensusMember } from "../src/domain/types.js";

const census = parseCensusCsv(readFileSync(new URL("../examples/northwind-census.csv", import.meta.url), "utf8"));

function withIds(): CensusMember[] {
  return census.map((member, index) => ({ ...member, id: `m${index}` }));
}

describe("federal age curve", () => {
  it("uses the 2018 child bands and the 3:1 adult cap", () => {
    expect(federalAgeFactor(0)).toBe(0.765);
    expect(federalAgeFactor(14)).toBe(0.765);
    expect(federalAgeFactor(15)).toBe(0.833);
    expect(federalAgeFactor(20)).toBe(0.97);
    expect(federalAgeFactor(21)).toBe(1);
    expect(federalAgeFactor(25)).toBe(1.004);
    expect(federalAgeFactor(40)).toBe(1.278);
    expect(federalAgeFactor(64)).toBe(3);
    expect(federalAgeFactor(90)).toBe(3);
  });

  it("bills only the three oldest children under 21", () => {
    const capped = cappedChildIds([
      { id: "a", age: 4 },
      { id: "b", age: 10 },
      { id: "c", age: 8 },
      { id: "d", age: 6 },
      { id: "e", age: 22 },
    ]);
    expect([...capped]).toEqual(["a"]);
  });
});

describe("small-group rating", () => {
  const members = withIds();
  const silver = samplePlans().find((plan) => plan.id === "med-silver-ppo");
  if (!silver) throw new Error("missing silver plan");

  it("rates the Cho household and skips the waived employee", () => {
    const quote = rateQuote({
      members,
      plans: [silver],
      areas: sampleAreaFactors(),
      effectiveDate: "2026-07-01",
      contribution: { mode: "percent_of_premium", employerPercent: 75 },
    });
    const plan = quote.plans[0];
    expect(quote.eligibleEmployees).toBe(2);
    expect(quote.enrolledEmployees).toBe(1);
    expect(quote.warnings.map((warning) => warning.code)).toContain("low_participation");
    expect(plan.monthlyPremiumCents).toBe(283_357);
    expect(plan.employerMonthlyCents).toBe(212_518);
    expect(plan.employeeMonthlyCents).toBe(70_839);
    const dee = plan.households[0].members.find((member) => member.name === "Dee Cho");
    expect(dee?.capped).toBe(true);
    expect(dee?.monthlyCents).toBe(0);
    expect(plan.households).toHaveLength(1);
  });

  it("does not use gender as a rating factor", () => {
    const flipped = members.map((member) => ({
      ...member,
      gender: member.gender === "female" ? "male" as const : "female" as const,
    }));
    const left = rateQuote({
      members,
      plans: [silver],
      areas: sampleAreaFactors(),
      effectiveDate: "2026-07-01",
      contribution: { mode: "percent_of_premium", employerPercent: 75 },
    });
    const right = rateQuote({
      members: flipped,
      plans: [silver],
      areas: sampleAreaFactors(),
      effectiveDate: "2026-07-01",
      contribution: { mode: "percent_of_premium", employerPercent: 75 },
    });
    expect(right.plans[0].monthlyPremiumCents).toBe(left.plans[0].monthlyPremiumCents);
  });

  it("applies a 1.5 tobacco load on the member who uses tobacco", () => {
    const smoking = members.map((member) =>
      member.id === "m0" ? { ...member, tobacco: true } : member,
    );
    const quote = rateQuote({
      members: smoking,
      plans: [silver],
      areas: sampleAreaFactors(),
      effectiveDate: "2026-07-01",
      contribution: { mode: "percent_of_premium", employerPercent: 0 },
    });
    const mina = quote.plans[0].households[0].members.find((member) => member.name === "Mina Cho");
    expect(mina?.factors.tobacco).toBe(1.5);
    expect(mina?.monthlyCents).toBe(Math.round(56_000 * 1.278 * 1.05 * 1.5));
    expect(ageOn("1986-07-01", "2026-07-01")).toBe(40);
  });

  it("prices dental on the family tier and recommends a portfolio", () => {
    const quote = rateQuote({
      members,
      plans: samplePlans(),
      areas: sampleAreaFactors(),
      effectiveDate: "2026-07-01",
      contribution: { mode: "percent_of_premium", employerPercent: 80 },
    });
    const dental = quote.plans.find((plan) => plan.planId === "dent-ppo-plus");
    expect(dental?.households[0].tier).toBe("employee_family");
    expect(dental?.monthlyPremiumCents).toBe(Math.round(15_500 * 1.05));
    const recommendation = recommendPlans(quote.plans, {
      prioritize: "balanced",
      employerBudgetMonthlyCents: 5_000_000,
    });
    expect(recommendation.selections.map((selection) => selection.line).sort()).toEqual(["dental", "medical", "vision"]);
    expect(recommendation.selections.find((selection) => selection.line === "medical")?.planId).toBe("med-gold-ppo");
    expect(recommendation.narrative.source).toBe("template");
    expect(recommendation.narrative.text).toContain("Recommend");
    expect(recommendation.withinBudget).toBe(true);
  });
});

describe("census csv", () => {
  it("rejects a family with no employee", () => {
    expect.assertions(2);
    try {
      parseCensusCsv("subscriber_id,relationship,first_name,last_name,date_of_birth,zip\nE9,child,Ada,Cho,2016-01-01,92101\n");
    } catch (error) {
      expect(error).toBeInstanceOf(CensusError);
      expect((error as CensusError).details.join(" ")).toMatch(/exactly one self/);
    }
  });

  it("accepts quoted commas", () => {
    const parsed = parseCensusCsv(
      'subscriber_id,relationship,first_name,last_name,date_of_birth,zip\nE1,self,"Mina","Cho, Jr",1986-07-01,92101-1234\n',
    );
    expect(parsed[0].lastName).toBe("Cho, Jr");
    expect(parsed[0].zip).toBe("92101");
  });
});
