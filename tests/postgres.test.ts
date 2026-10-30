import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { closeDatabases } from "../src/db/sql.js";
import { Store } from "../src/db/store.js";
import { buildApp } from "../src/http/app.js";
import { seedDatabase } from "../src/seed.js";

const databaseUrl = process.env.POSTGRES_TEST_URL ?? "";
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres("postgres persistence", () => {
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl,
    APP_SECRET: "test-secret-that-is-long-enough-32",
    BCRYPT_ROUNDS: "4",
    SEED_BROKER_EMAIL: "broker@example.com",
    SEED_BROKER_PASSWORD: "demo1234",
    WEB_ORIGIN: "http://localhost:3000",
  });
  let store: Store;

  beforeAll(async () => {
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
    await client.end();
    store = await Store.open(databaseUrl);
    await seedDatabase(store, config);
  });

  afterAll(async () => {
    await store?.close();
    await closeDatabases();
  });

  it("stores a filed quote and locks tables down for the anon role", async () => {
    const regions = await store.ratingRegionMap();
    expect(regions.get("92101")).toBe("19");
    const app = await buildApp({ config, store, finch: null });
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "broker@example.com", password: "demo1234" },
    });
    expect(login.statusCode).toBe(200);
    const token = login.json().token as string;
    const created = await app.inject({
      method: "POST",
      url: "/v1/groups",
      headers: { authorization: `Bearer ${token}` },
      payload: { legal_name: "Northwind Studio", state: "CA", zip: "92101", effective_date: "2026-10-01" },
    });
    const groupId = created.json().group.id as string;
    const quote = await app.inject({
      method: "POST",
      url: `/v1/groups/${groupId}/quotes`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: {
        plan_ids: ["bsc-2026q4-gold-full-ppo-1000-30-offex"],
        contribution: { mode: "percent_of_premium", employer_percent: 75 },
      },
    });
    expect(quote.statusCode).toBe(422);
    const census = "subscriber_id,relationship,first_name,last_name,date_of_birth,zip,tobacco\n1,self,Mina,Cho,1986-03-02,92101,yes\n";
    const uploaded = await app.inject({
      method: "PUT",
      url: `/v1/groups/${groupId}/census`,
      headers: { authorization: `Bearer ${token}`, "content-type": "text/csv" },
      payload: census,
    });
    expect(uploaded.statusCode).toBe(200);
    const rated = await app.inject({
      method: "POST",
      url: `/v1/groups/${groupId}/quotes`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "idempotency-key": "pg-1" },
      payload: {
        plan_ids: ["bsc-2026q4-gold-full-ppo-1000-30-offex"],
        contribution: { mode: "percent_of_premium", employer_percent: 75 },
      },
    });
    expect(rated.statusCode).toBe(201);
    const plan = rated.json().quote.plans[0];
    expect(plan.monthly_premium_cents).toBe(83870);
    expect(plan.households[0].members[0].factors.tobacco).toBe(1);

    const again = await Store.open(databaseUrl);
    expect((await again.listGroups(null)).some((group) => group.id === groupId)).toBe(true);
    expect((await again.listCensus(groupId))[0]?.tobacco).toBe(true);
    expect(await again.tableIsProtected("finch_connections")).toBe(true);
    expect(await again.tableIsProtected("census_members")).toBe(true);
    await again.close();
    await app.close();
  });
});
