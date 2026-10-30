import bcrypt from "bcryptjs";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { Store } from "../src/db/store.js";
import { buildApp } from "../src/http/app.js";
import { seedDatabase } from "../src/seed.js";

const csv = readFileSync(new URL("../examples/northwind-coffee.csv", import.meta.url), "utf8");

describe("harbor quote API", () => {
  const directory = mkdtempSync(join(tmpdir(), "harbor-quote-"));
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: `file:${directory}/agency.db`,
    APP_SECRET: "test-secret-that-is-long-enough-32",
    BCRYPT_ROUNDS: "4",
    SEED_BROKER_EMAIL: "broker@example.com",
    SEED_BROKER_PASSWORD: "demo1234",
    SEED_BROKER_NAME: "Jordan Lee",
    WEB_ORIGIN: "http://localhost:3000",
  });
  let store: Store;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    store = await Store.open(config.databaseUrl);
    await seedDatabase(store, config);
    app = await buildApp({ config, store, finch: null });
  });

  afterAll(async () => {
    await app?.close();
    await store?.close();
  });

  it("lets an agency admin quote, download a pdf, invite a broker, and hide the quote from another agency", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "broker@example.com", password: "demo1234" },
    });
    expect(login.statusCode).toBe(200);
    const token = login.json().token as string;
    const created = await app.inject({
      method: "POST",
      url: "/v1/small-group/quotes",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        employer_name: "Northwind Coffee Co.",
        employer_zip: "92101",
        effective_date: "2026-08-01",
        census_csv: csv,
        employer_employee_percent: 80,
        employer_dependent_percent: 50,
      },
    });
    expect(created.statusCode).toBe(201);
    const quote = created.json().quote;
    expect(quote.employeeCount).toBe(42);
    expect(quote.ratingArea).toBe("19");
    expect(quote.plans.length).toBeGreaterThan(8);
    const pdf = await app.inject({
      method: "GET",
      url: `/v1/small-group/quotes/${quote.id}/pdf`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(pdf.body.slice(0, 5)).toBe("%PDF-");

    const invited = await app.inject({
      method: "POST",
      url: "/v1/small-group/brokers",
      headers: { authorization: `Bearer ${token}` },
      payload: { email: "casey@example.com", name: "Casey Broker" },
    });
    expect(invited.statusCode).toBe(201);
    const brokerLogin = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "casey@example.com", password: invited.json().temporary_password },
    });
    const seen = await app.inject({
      method: "GET",
      url: `/v1/small-group/quotes/${quote.id}`,
      headers: { authorization: `Bearer ${brokerLogin.json().token}` },
    });
    expect(seen.statusCode).toBe(200);

    await store.createUser({
      id: "outsider",
      email: "outsider@example.com",
      name: "Outsider",
      passwordHash: await bcrypt.hash("another-password", 4),
      role: "broker",
      createdAt: new Date().toISOString(),
    });
    const outsider = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "outsider@example.com", password: "another-password" },
    });
    const hidden = await app.inject({
      method: "GET",
      url: `/v1/small-group/quotes/${quote.id}`,
      headers: { authorization: `Bearer ${outsider.json().token}` },
    });
    expect(hidden.statusCode).toBe(404);

    const bad = await app.inject({
      method: "POST",
      url: "/v1/small-group/quotes",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        employer_name: "Northwind Coffee Co.",
        employer_zip: "92101",
        effective_date: "2026-08-01",
        census_csv: "employee_name,date_of_birth,zip\nAda,not-a-date,92101\n",
        employer_employee_percent: 80,
        employer_dependent_percent: 50,
      },
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.details.join(" ")).toMatch(/Row 2/);
  });
});
