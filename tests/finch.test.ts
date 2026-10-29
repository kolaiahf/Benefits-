import { describe, expect, it } from "vitest";
import { annualSalaryCents, FinchClient } from "../src/finch/client.js";
import { censusFromFinch } from "../src/finch/map.js";
import { decryptString, encryptString } from "../src/crypto.js";

describe("Finch payroll mapping", () => {
  it("annualizes income stored in cents", () => {
    expect(annualSalaryCents({ amount: 10_000_000, unit: "yearly", currency: "usd" })).toBe(10_000_000);
    expect(annualSalaryCents({ amount: 500_000, unit: "monthly", currency: "usd" })).toBe(6_000_000);
    expect(annualSalaryCents({ amount: 4_000, unit: "hourly", currency: "usd" })).toBe(4_000 * 2080);
  });

  it("builds a census and current medical enrollment from Finch payloads", () => {
    const result = censusFromFinch({
      fallbackZip: "94105",
      directory: [
        { id: "emp_1", firstName: "Mina", lastName: "Cho", isActive: true },
        { id: "emp_2", firstName: "Left", lastName: "Job", isActive: false },
      ],
      individuals: [
        {
          id: "emp_1",
          firstName: "Mina",
          lastName: "Cho",
          dob: "1986-07-01",
          gender: "female",
          postalCode: "92101",
          email: "mina@example.com",
        },
      ],
      employment: [
        { id: "emp_1", isActive: true, title: "Designer", income: { amount: 12_000_000, unit: "yearly", currency: "usd" } },
      ],
      plans: [{ id: "plan_med", type: "medical", name: "PPO Gold", carrier: "Blue Sample" }],
      enrollments: [
        {
          id: "enr_1",
          individualId: "emp_1",
          planId: "plan_med",
          coverageTier: "employee_family",
          status: "active",
          employeeContributionCents: 12_500,
          employerContributionCents: 37_500,
          frequency: "per_pay_period",
          dependentIds: ["dep_1"],
        },
      ],
      dependents: [
        {
          id: "dep_1",
          individualId: "emp_1",
          firstName: "Owen",
          lastName: "Cho",
          dob: "1988-01-01",
          relationship: "spouse",
        },
      ],
    });
    expect(result.members.map((member) => member.relationship)).toEqual(["self", "spouse"]);
    expect(result.members[0].annualSalaryCents).toBe(12_000_000);
    expect(result.members[0].zip).toBe("92101");
    expect(result.benefits[0]).toMatchObject({
      line: "medical",
      enrolled: 1,
      employeeContributionCents: 12_500,
      employerContributionCents: 37_500,
    });
    expect(result.members.some((member) => member.lastName === "Job")).toBe(false);
  });
});

describe("Finch client", () => {
  it("creates a connect session and pages the directory", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/connect/sessions")) {
        const auth = new Headers(init?.headers).get("authorization") ?? "";
        expect(auth.startsWith("Basic ")).toBe(true);
        return json({ session_id: "sess_1", connect_url: "https://connect.tryfinch.com/auth/sess_1" });
      }
      if (url.includes("/employer/directory")) {
        const offset = Number(new URL(url).searchParams.get("offset"));
        const individuals = offset === 0
          ? [{ id: "emp_1", first_name: "Mina", last_name: "Cho", is_active: true }]
          : [];
        return json({ paging: { count: individuals.length, offset }, individuals });
      }
      if (url.includes("/auth/token")) {
        return json({
          access_token: "token_1",
          connection_id: "conn_1",
          provider_id: "gusto",
          products: ["directory", "individual"],
          entity_ids: ["ent_1"],
          customer_id: "group_1",
          token_type: "bearer",
        });
      }
      return json({}, 404);
    };
    const client = new FinchClient({
      clientId: "client",
      clientSecret: "secret",
      redirectUri: "http://localhost:5173/finch/callback",
      apiBase: "https://api.tryfinch.com",
      sandbox: "finch",
      fetchImpl,
    });
    const session = await client.createSession({ customerId: "group_1", customerName: "Northwind" });
    expect(session.connectUrl).toContain("sess_1");
    const token = await client.exchangeCode("code_1");
    expect(token.providerId).toBe("gusto");
    const directory = await client.directory(token.accessToken, "ent_1");
    expect(directory).toEqual([{ id: "emp_1", firstName: "Mina", lastName: "Cho", isActive: true }]);
    expect(calls.some((call) => call.includes("entity_ids=ent_1"))).toBe(true);
  });
});

describe("token encryption", () => {
  it("round-trips a Finch access token", () => {
    const secret = "test-secret-that-is-long-enough";
    const encrypted = encryptString(secret, "finch-access-token");
    expect(encrypted).not.toContain("finch-access-token");
    expect(decryptString(secret, encrypted)).toBe("finch-access-token");
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
