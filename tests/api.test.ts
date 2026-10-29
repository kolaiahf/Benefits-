import bcrypt from "bcryptjs";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { Store } from "../src/db/store.js";
import type { FinchClient } from "../src/finch/client.js";
import { buildApp } from "../src/http/app.js";
import { seedDatabase } from "../src/seed.js";

const csv = readFileSync(new URL("../examples/northwind-census.csv", import.meta.url), "utf8");

describe("Harbor API", () => {
  const directory = mkdtempSync(join(tmpdir(), "harbor-"));
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: `file:${directory}/agency.db`,
    APP_SECRET: "test-secret-that-is-long-enough-32",
    BCRYPT_ROUNDS: "4",
    SEED_BROKER_EMAIL: "broker@example.com",
    SEED_BROKER_PASSWORD: "demo1234",
    SEED_BROKER_NAME: "Avery Chen",
    WEB_ORIGIN: "http://localhost:5173",
  });
  let store: Store;
  let token = "";
  let groupId = "";

  const finch = {
    async createSession() {
      return { sessionId: "sess_1", connectUrl: "https://connect.tryfinch.com/auth/sess_1" };
    },
    async exchangeCode() {
      return {
        accessToken: "finch-token",
        connectionId: "conn_1",
        providerId: "gusto",
        products: ["directory", "individual", "employment", "benefits"],
        entityIds: ["ent_1"],
        customerId: null,
      };
    },
    async directory() {
      return [{ id: "emp_1", firstName: "Nia", lastName: "Shah", isActive: true }];
    },
    async individuals() {
      return [{
        id: "emp_1",
        firstName: "Nia",
        lastName: "Shah",
        dob: "1991-04-04",
        gender: "female",
        postalCode: "92101",
        email: "nia@example.com",
      }];
    },
    async employment() {
      return [{ id: "emp_1", isActive: true, title: "Producer", income: { amount: 9_000_000, unit: "yearly", currency: "usd" } }];
    },
    async company() {
      return { id: "co_1", legalName: "Northwind Studio LLC", ein: null };
    },
    async plans() {
      return [{ id: "plan_med", type: "medical", name: "Current PPO", carrier: "Sample" }];
    },
    async enrollments() {
      return [{
        id: "enr_1",
        individualId: "emp_1",
        planId: "plan_med",
        coverageTier: "employee_only",
        status: "active",
        employeeContributionCents: 8_000,
        employerContributionCents: 40_000,
        frequency: "monthly",
        dependentIds: [],
      }];
    },
    async dependents() {
      return [];
    },
  } as unknown as FinchClient;

  beforeAll(async () => {
    store = await Store.open(config.databaseUrl);
    await seedDatabase(store, config);
  });

  afterAll(async () => {
    await store.close();
  });

  it("logs in, quotes the sample census, and hides the group from another broker", async () => {
    const app = await buildApp({ config, store, finch });
    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);

    const spec = await app.inject({ method: "GET", url: "/v1/openapi.json" });
    expect(spec.json().paths["/v1/groups/{id}/quotes"]).toBeTruthy();

    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "broker@example.com", password: "demo1234" },
    });
    expect(login.statusCode).toBe(200);
    token = login.json().token as string;

    const created = await app.inject({
      method: "POST",
      url: "/v1/groups",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        legal_name: "Northwind Studio",
        state: "CA",
        zip: "92101",
        effective_date: "2026-07-01",
        sic: "7336",
      },
    });
    expect(created.statusCode).toBe(201);
    groupId = created.json().group.id as string;

    const census = await app.inject({
      method: "PUT",
      url: `/v1/groups/${groupId}/census`,
      headers: { authorization: `Bearer ${token}`, "content-type": "text/csv" },
      payload: csv,
    });
    expect(census.statusCode).toBe(200);
    expect(census.json().count).toBe(7);

    const quote = await app.inject({
      method: "POST",
      url: `/v1/groups/${groupId}/quotes`,
      headers: { authorization: `Bearer ${token}`, "idempotency-key": "quote-1" },
      payload: {
        plan_ids: ["med-silver-ppo", "dent-ppo-plus", "vis-plus"],
        contribution: { mode: "percent_of_premium", employer_percent: 75 },
        preferences: { prioritize: "balanced", employer_budget_monthly_cents: 5_000_000 },
      },
    });
    expect(quote.statusCode).toBe(201);
    const document = quote.json().quote;
    const silver = document.plans.find((plan: { plan_id: string }) => plan.plan_id === "med-silver-ppo");
    expect(silver.monthly_premium_cents).toBe(283_357);
    expect(silver.employer_monthly_cents).toBe(212_518);
    expect(document.illustrative).toBe(true);
    expect(document.recommendation.selections).toHaveLength(3);
    expect(document.recommendation.narrative.text).toContain("Recommend");

    const replay = await app.inject({
      method: "POST",
      url: `/v1/groups/${groupId}/quotes`,
      headers: { authorization: `Bearer ${token}`, "idempotency-key": "quote-1" },
      payload: {
        contribution: { mode: "percent_of_premium", employer_percent: 75 },
      },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().quote.id).toBe(document.id);

    const csvQuote = await app.inject({
      method: "GET",
      url: `/v1/quotes/${document.id}?format=csv`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(csvQuote.headers["content-type"]).toContain("text/csv");
    expect(csvQuote.body).toContain("med-silver-ppo");

    const key = await app.inject({
      method: "POST",
      url: "/v1/api-keys",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "proposal bot" },
    });
    expect(key.statusCode).toBe(201);
    const apiToken = key.json().token as string;
    const viaKey = await app.inject({
      method: "GET",
      url: `/v1/groups/${groupId}`,
      headers: { authorization: `Bearer ${apiToken}` },
    });
    expect(viaKey.statusCode).toBe(200);

    await store.createUser({
      id: "broker-2",
      email: "other@example.com",
      name: "Other Broker",
      passwordHash: await bcrypt.hash("another-password", 4),
      role: "broker",
      createdAt: new Date().toISOString(),
    });
    const otherLogin = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "other@example.com", password: "another-password" },
    });
    const hidden = await app.inject({
      method: "GET",
      url: `/v1/groups/${groupId}`,
      headers: { authorization: `Bearer ${otherLogin.json().token}` },
    });
    expect(hidden.statusCode).toBe(404);

    const session = await app.inject({
      method: "POST",
      url: `/v1/groups/${groupId}/finch/session`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(session.json().connect_url).toContain("connect.tryfinch.com");

    const exchange = await app.inject({
      method: "POST",
      url: `/v1/groups/${groupId}/finch/exchange`,
      headers: { authorization: `Bearer ${token}` },
      payload: { code: "auth-code" },
    });
    expect(exchange.json().provider_id).toBe("gusto");

    const sync = await app.inject({
      method: "POST",
      url: `/v1/groups/${groupId}/finch/sync`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(sync.statusCode).toBe(200);
    expect(sync.json().members[0].first_name).toBe("Nia");
    expect(sync.json().benefits[0].line).toBe("medical");
    expect(sync.json().members[0].annual_salary_cents).toBe(9_000_000);

    await app.close();
  });

  it("refuses Finch when the server has no client and no credentials", async () => {
    const bare = loadConfig({
      ...process.env,
      NODE_ENV: "test",
      FINCH_CLIENT_ID: "",
      FINCH_CLIENT_SECRET: "",
      APP_SECRET: "test-secret-that-is-long-enough-32",
      DATABASE_URL: config.databaseUrl,
    });
    const app = await buildApp({ config: { ...bare, finch: { ...bare.finch, clientId: "", clientSecret: "" } }, store, finch: null });
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "broker@example.com", password: "demo1234" },
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/groups/${groupId}/finch/session`,
      headers: { authorization: `Bearer ${login.json().token}` },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("finch_not_configured");
    await app.close();
  });
});
