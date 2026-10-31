import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { clearSupabaseAuthCache } from "../src/auth/supabaseUser.js";
import { loadBrand } from "../src/brand.js";
import { assertProductionReady } from "../src/http/boot.js";
import { loadConfig } from "../src/config.js";
import { schemaSql } from "../src/db/schema.js";
import { PROTECTED_TABLES } from "../src/db/postgresSecurity.js";
import { Store } from "../src/db/store.js";
import type { FinchClient } from "../src/finch/client.js";
import { buildApp } from "../src/http/app.js";
import { seedDatabase } from "../src/seed.js";

const ada = {
  id: "6b1e0c3a-1111-4111-8111-111111111111",
  email: "ada@example.com",
  user_metadata: { name: "Ada Lovelace" },
};
const grace = {
  id: "7c2f1d4b-2222-4222-8222-222222222222",
  email: "grace@example.com",
  user_metadata: { name: "Grace Hopper" },
};

describe("branding", () => {
  it("keeps the placeholder brand in one module and ignores unsafe overrides", () => {
    const brand = loadBrand({});
    expect(brand.productName).toBe("Harbor");
    expect(brand.agencyName).toBe("Harbor Agency");
    expect(JSON.stringify(brand).toLowerCase()).not.toContain("marsh");
    const custom = loadBrand({
      BRAND_PRODUCT_NAME: "Northstar",
      BRAND_COLOR_ACCENT: "navy",
      BRAND_COLOR_PAPER: "#abcdef",
      BRAND_LOGO_URL: "javascript:alert(1)",
    });
    expect(custom.productName).toBe("Northstar");
    expect(custom.agencyName).toBe("Northstar Agency");
    expect(custom.colors.accent).toBe("#1d6a49");
    expect(custom.colors.paper).toBe("#abcdef");
    expect(custom.logoUrl).toBe("");
    expect(loadBrand({ BRAND_LOGO_URL: "https://cdn.example.com/mark.svg" }).logoUrl).toBe("https://cdn.example.com/mark.svg");
  });

  it("does not hardcode the placeholder or a Marsh name in the interface", () => {
    const paths = [...walk("web/src"), ...walk("app")];
    expect(paths.length).toBeGreaterThan(5);
    for (const path of paths) {
      const text = readFileSync(path, "utf8").toLowerCase();
      expect(text, path).not.toContain("marsh");
      expect(text, path).not.toContain("mclennan");
      expect(text, path).not.toContain("harbor");
      expect(text, path).not.toContain("demo1234");
    }
  });

  it("protects every application table when the database is postgres", () => {
    const created = [...schemaSql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((match) => match[1]);
    expect(created.sort()).toEqual([...PROTECTED_TABLES].sort());
  });
});

describe("Supabase sessions", () => {
  const directory = mkdtempSync(join(tmpdir(), "agency-auth-"));
  const config = loadConfig({
    NODE_ENV: "test",
    AUTH_MODE: "supabase",
    DATABASE_URL: `file:${directory}/agency.db`,
    APP_SECRET: "test-secret-that-is-long-enough-32",
    BCRYPT_ROUNDS: "4",
    NEXT_PUBLIC_SUPABASE_URL: "https://auth.example.test",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    WEB_ORIGIN: "http://localhost:3000",
  });
  let store: Store;
  const originalFetch = globalThis.fetch;

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    clearSupabaseAuthCache();
    await store?.close();
  });

  it("creates the broker from a verified access token and stores the group, census, quote, and Finch connection", async () => {
    clearSupabaseAuthCache();
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.endsWith("/auth/v1/user")) return originalFetch(input, init);
      expect(new Headers(init?.headers).get("apikey")).toBe("test-anon-key");
      const token = new Headers(init?.headers).get("authorization")?.replace(/^Bearer\s+/i, "");
      const user = token === "aaa.bbb.ccc" ? ada : token === "ddd.eee.fff" ? grace : null;
      return new Response(user ? JSON.stringify(user) : "{}", { status: user ? 200 : 401 });
    }) as typeof fetch;
    store = await Store.open(config.databaseUrl);
    await seedDatabase(store, config);
    expect(await store.countUsers()).toBe(0);
    const finch = {
      async createSession() {
        return { sessionId: "sess_1", connectUrl: "https://connect.tryfinch.com/auth/sess_1" };
      },
      async exchangeCode() {
        return {
          accessToken: "finch-token",
          connectionId: "conn_1",
          providerId: "gusto",
          products: ["directory"],
          entityIds: ["ent_1"],
          customerId: null,
        };
      },
    } as unknown as FinchClient;
    const app = await buildApp({ config, store, finch });
    const denied = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "ada@example.com", password: "whatever-password" },
    });
    expect(denied.statusCode).toBe(404);

    const me = await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: "Bearer aaa.bbb.ccc" } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user).toMatchObject({ email: "ada@example.com", name: "Ada Lovelace", role: "admin" });

    const bad = await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: "Bearer bad.token.value" } });
    expect(bad.statusCode).toBe(401);

    const created = await app.inject({
      method: "POST",
      url: "/v1/groups",
      headers: { authorization: "Bearer aaa.bbb.ccc" },
      payload: { legal_name: "Northwind Studio", state: "CA", zip: "92101", effective_date: "2026-10-01" },
    });
    expect(created.statusCode).toBe(201);
    const groupId = created.json().group.id as string;

    const census = await app.inject({
      method: "PUT",
      url: `/v1/groups/${groupId}/census`,
      headers: { authorization: "Bearer aaa.bbb.ccc", "content-type": "text/csv" },
      payload: readFileSync(new URL("../examples/northwind-census.csv", import.meta.url), "utf8"),
    });
    expect(census.statusCode).toBe(200);
    expect(census.json().count).toBeGreaterThan(0);

    const quote = await app.inject({
      method: "POST",
      url: `/v1/groups/${groupId}/quotes`,
      headers: { authorization: "Bearer aaa.bbb.ccc", "content-type": "application/json" },
      payload: {
        plan_ids: ["bsc-2026q4-gold-full-ppo-1000-30-offex"],
        contribution: { mode: "percent_of_premium", employer_percent: 75 },
        preferences: { prioritize: "balanced" },
      },
    });
    expect(quote.statusCode).toBe(201);
    expect(quote.json().quote.rating_region).toBe("19");

    const exchanged = await app.inject({
      method: "POST",
      url: `/v1/groups/${groupId}/finch/exchange`,
      headers: { authorization: "Bearer aaa.bbb.ccc" },
      payload: { code: "finch-code" },
    });
    expect(exchanged.statusCode).toBe(200);
    const connection = await store.getFinchConnection(groupId);
    expect(connection?.providerId).toBe("gusto");
    expect(connection?.accessTokenCiphertext).not.toContain("finch-token");

    const other = await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: "Bearer ddd.eee.fff" } });
    expect(other.json().user.role).toBe("broker");
    const hidden = await app.inject({
      method: "GET",
      url: `/v1/groups/${groupId}`,
      headers: { authorization: "Bearer ddd.eee.fff" },
    });
    expect(hidden.statusCode).toBe(404);

    const reopened = await Store.open(config.databaseUrl);
    expect((await reopened.findUserByEmail("ada@example.com"))?.role).toBe("admin");
    expect(await reopened.getQuote(quote.json().quote.id)).not.toBeNull();
    expect((await reopened.listCensus(groupId)).length).toBe(census.json().count);
    await reopened.close();
    await app.close();
  });
});

describe("production boot", () => {
  it("requires Supabase Auth and Postgres, and refuses the sample broker password", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      APP_SECRET: "x".repeat(32),
      DATABASE_URL: "file:./data/agency.db",
      NEXT_PUBLIC_SUPABASE_URL: "https://auth.example.test",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    });
    expect(config.authMode).toBe("supabase");
    expect(config.seedBroker).toBe(false);
    expect(() => assertProductionReady(config)).toThrow(/Postgres/);
    expect(() => loadConfig({
      NODE_ENV: "production",
      APP_SECRET: "x".repeat(32),
      DATABASE_URL: "postgresql://localhost/agency",
      NEXT_PUBLIC_SUPABASE_URL: "https://auth.example.test",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      SEED_BROKER_PASSWORD: "demo1234",
    })).toThrow(/SEED_BROKER_PASSWORD/);
  });
});

describe("demo mode", () => {
  const demo = {
    NODE_ENV: "production",
    APP_SECRET: "x".repeat(32),
    DATABASE_URL: "file:/tmp/agency.db",
    AUTH_MODE: "password",
    SEED_BROKER_PASSWORD: "a-unique-demo-pass",
  };

  it("runs a Vercel preview with password sign-in and a /tmp sqlite file", () => {
    const config = loadConfig({ ...demo, VERCEL_ENV: "preview" });
    expect(config.demoMode).toBe(true);
    expect(config.authMode).toBe("password");
    expect(() => assertProductionReady(config)).not.toThrow();
    expect(() => assertProductionReady(loadConfig({ ...demo, VERCEL_ENV: "preview", DATABASE_URL: "file:./data/agency.db" }))).toThrow(/Demo mode/);
  });

  it("never turns on for Vercel production or without an explicit opt-in", () => {
    const prod = loadConfig({ ...demo, VERCEL_ENV: "production", DEMO_MODE: "true" });
    expect(prod.demoMode).toBe(false);
    expect(prod.authMode).toBe("supabase");
    expect(() => assertProductionReady(prod)).toThrow(/SUPABASE/);
    expect(loadConfig(demo).demoMode).toBe(false);
    expect(loadConfig({ ...demo, DEMO_MODE: "true" }).demoMode).toBe(true);
    expect(loadConfig({ ...demo, VERCEL_ENV: "preview", AUTH_MODE: "supabase" }).demoMode).toBe(false);
    expect(() => loadConfig({ ...demo, VERCEL_ENV: "preview", SEED_BROKER_PASSWORD: "short" })).toThrow(/SEED_BROKER_PASSWORD/);
  });
});

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(tsx|css)$/.test(name) ? [path] : [];
  });
}
