import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { federalAgeFactor } from "../src/domain/age.js";
import { parseQuoteCensus, CensusValidationError } from "../src/quoting/census.js";
import { loadRateCatalog } from "../src/quoting/catalog.js";
import { buildQuoteDocument } from "../src/quoting/buildQuote.js";
import { memberMonthlyCents, ratePlan, splitEmployerShare } from "../src/quoting/engine.js";
import { ratingAreaForZip } from "../src/quoting/regions.js";
import { QUOTE_DISCLAIMER } from "../src/quoting/types.js";
import { parseHealthNetPpo, HEALTH_NET_PPO_NAMES } from "../src/rates/books/parseHealthNet.js";
import { parseSharp } from "../src/rates/books/parseSharp.js";
import { renderQuotePdf } from "../src/quoting/pdf.js";

const effective = "2026-08-01";

describe("california small-group rating", () => {
  it("uses one child band, single ages 15–63, and one 64+ band", () => {
    expect(federalAgeFactor(0)).toBe(0.765);
    expect(federalAgeFactor(14)).toBe(0.765);
    expect(federalAgeFactor(15)).toBe(0.833);
    expect(federalAgeFactor(21)).toBe(1);
    expect(federalAgeFactor(63)).toBe(2.952);
    expect(federalAgeFactor(64)).toBe(3);
    expect(federalAgeFactor(80)).toBe(3);
  });

  it("splits Los Angeles between rating areas 15 and 16", () => {
    expect(ratingAreaForZip("90601")).toBe("15");
    expect(ratingAreaForZip("90001")).toBe("16");
    expect(ratingAreaForZip("92101")).toBe("19");
    expect(ratingAreaForZip("00000")).toBeNull();
  });

  it("charges only the three oldest children under 21 and still charges a 21-year-old", () => {
    const people = [
      person("ee", "ee", "employee", "1983-08-01", "Ada L."),
      person("sp", "ee", "spouse", "1985-08-01", "Spouse"),
      person("c1", "ee", "child", "2008-08-01", "Older"),
      person("c2", "ee", "child", "2010-08-01", "Middle"),
      person("c3", "ee", "child", "2012-08-01", "Younger"),
      person("c4", "ee", "child", "2016-08-01", "Youngest"),
      person("c5", "ee", "child", "2005-08-01", "Adult child"),
    ];
    const rated = ratePlan({
      people,
      baseCents: 10_000,
      effectiveDate: effective,
      contribution: { employerEmployeePercent: 80, employerDependentPercent: 50 },
    });
    const byName = new Map(rated.employees[0].people.map((member) => [member.name, member]));
    expect(byName.get("Youngest")?.capped).toBe(true);
    expect(byName.get("Youngest")?.monthlyCents).toBe(0);
    expect(byName.get("Adult child")?.capped).toBe(false);
    expect(byName.get("Adult child")?.age).toBe(21);
    expect(byName.get("Adult child")?.monthlyCents).toBe(10_000);
    const employeeOnly = byName.get("Ada L.")?.monthlyCents ?? 0;
    const dependents = rated.monthlyCents - employeeOnly;
    const split = splitEmployerShare(
      { employerEmployeePercent: 80, employerDependentPercent: 50 },
      employeeOnly,
      dependents,
    );
    expect(rated.employerCents).toBe(split.employerCents);
    expect(rated.employeeCents).toBe(rated.monthlyCents - rated.employerCents);
    expect(rated.monthlyCents).toBe(rated.employees.reduce((sum, row) => sum + row.monthlyCents, 0));
  });

  it("rounds each member as base times the age factor", () => {
    expect(memberMonthlyCents(62_076, 40)).toBe(Math.round(62_076 * federalAgeFactor(40)));
    expect(memberMonthlyCents(62_076, 23)).toBe(62_076);
  });

  it("rejects a census that is not 1 to 100 employees and reports the row", () => {
    expect(() => parseQuoteCensus("employee_name,date_of_birth,zip\n", effective)).toThrow(CensusValidationError);
    try {
      parseQuoteCensus("employee_name,date_of_birth,zip\nAda,13/01/2000,92101\n", effective);
    } catch (error) {
      expect(error).toBeInstanceOf(CensusValidationError);
      expect((error as CensusValidationError).issues.join(" ")).toMatch(/Row 2/);
    }
  });
});

describe("rate books", () => {
  it("reads the Health Net PPO column order", () => {
    const text = `
PPO Rates
New and renewing business, effective July 1, 2026 through September 30, 2026
Region 19
350/25 1500/20 7200/0%
21 1.00 2.00 3.00 4.00 5.00 6.00 7.00 8.00 620.76 10.00 11.00 12.00 13.00 14.00 15.00 16.00 17.00
`;
    const parsed = parseHealthNetPpo(text);
    expect(parsed).toHaveLength(1);
    expect(HEALTH_NET_PPO_NAMES[8]).toBe("Gold PPO 1500/20");
    expect(parsed[0].age21Cents[8]).toBe(62076);
  });

  it("reads a Sharp non-mirrored age-21 row", () => {
    const page = `
Sharp Choice Small Group
Rates for Non-Mirrored Plans
Effective October 1, 2026 to December 31, 2026
Metal Tier   Platinum      Gold
Age Band     HMO NG 1      HMO NG 2
21           $577.28       $510.38
`;
    const parsed = parseSharp(`\f${page}\f`);
    expect(parsed.rates.map((row) => `${row.metal} ${row.name}`)).toEqual([
      "platinum HMO NG 1",
      "gold HMO NG 2",
    ]);
    expect(parsed.rates[0].age21Cents).toBe(57728);
  });
});

describe("northwind coffee quote", () => {
  const csv = readFileSync(new URL("../examples/northwind-coffee.csv", import.meta.url), "utf8");

  it("rates the example census on area 19 and bills only three of Bo's children", () => {
    const parsed = parseQuoteCensus(csv, effective);
    expect(parsed.people.filter((person) => person.relationship === "employee")).toHaveLength(42);
    const catalog = loadRateCatalog();
    const quote = buildQuoteDocument({
      id: "northwind",
      employerName: "Northwind Coffee Co.",
      employerZip: "92101",
      effectiveDate: effective,
      people: parsed.people,
      contribution: { employerEmployeePercent: 80, employerDependentPercent: 50 },
      preparedBy: { name: "Jordan Lee", email: "jordan.lee@harborbenefits.example" },
      preparedOn: "2026-10-30",
      catalog: catalog.plans,
    });
    expect(quote.ratingArea).toBe("19");
    expect(quote.employeeCount).toBe(42);
    expect(quote.plans.length).toBeGreaterThanOrEqual(8);
    expect(quote.disclaimer).toBe(QUOTE_DISCLAIMER);
    const carriers = new Set(quote.plans.map((plan) => plan.carrierName));
    expect(carriers.has("Health Net")).toBe(true);
    expect(carriers.has("Blue Shield of California")).toBe(true);
    expect(carriers.has("Sharp Health Plan")).toBe(false);
    const healthNet = quote.plans.find((plan) => plan.planName === "Gold PPO 1500/20");
    const bo = healthNet?.employees.find((employee) => employee.name === "Bo W.");
    expect(bo?.covers).toBe("+ 4 children");
    expect(bo?.people.filter((person) => person.capped)).toHaveLength(1);
    const ava = healthNet?.employees.find((employee) => employee.name === "Ava R.");
    expect(ava?.monthlyCents).toBe(62076);
    const first = quote.plans[0];
    expect(first.monthlyCents).toBe(first.employees.reduce((sum, row) => sum + row.monthlyCents, 0));
    expect(first.employerCents + first.employeeCents).toBe(first.monthlyCents);
  });

  it("builds a pdf", async () => {
    const parsed = parseQuoteCensus("employee_name,date_of_birth,zip\nAda L.,1990-08-01,92101\n", effective);
    const quote = buildQuoteDocument({
      id: "pdf",
      employerName: "Northwind Coffee Co.",
      employerZip: "92101",
      effectiveDate: effective,
      people: parsed.people,
      contribution: { employerEmployeePercent: 80, employerDependentPercent: 50 },
      preparedBy: { name: "Jordan Lee", email: "jordan.lee@harborbenefits.example" },
      preparedOn: "2026-10-30",
      catalog: loadRateCatalog().plans.slice(0, 3),
    });
    const pdf = await renderQuotePdf(quote, "Harbor");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });
});

function person(
  id: string,
  employeeId: string,
  relationship: "employee" | "spouse" | "child",
  dateOfBirth: string,
  name: string,
) {
  return { id, employeeId, name, relationship, dateOfBirth };
}
