import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import bcrypt from "bcryptjs";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { z, ZodError } from "zod";
import { narrateRecommendation } from "../ai/narrate.js";
import { finchConfigured, type AppConfig } from "../config.js";
import { apiKey, encryptString, decryptString, randomToken, sha256 } from "../crypto.js";
import { sampleAreaFactors, samplePlans } from "../domain/catalog.js";
import { assertHouseholds, CensusError, parseCensusCsv, type CensusDraft } from "../domain/census.js";
import { parseIsoDate } from "../domain/money.js";
import { recommendPlans } from "../domain/recommend.js";
import { rateQuote } from "../domain/rating.js";
import type { AncillaryPlan, AreaFactor, Contribution, MedicalPlan, Plan, RecommendPreferences } from "../domain/types.js";
import type { Store, UserRow } from "../db/store.js";
import { FinchClient, FinchError } from "../finch/client.js";
import { pullFinchCensus } from "../finch/sync.js";
import { openApiDocument } from "./openapi.js";
import { draftFromPublic, publicMember, publicQuoteDocument, quoteCsv, type PublicQuote } from "./serialize.js";

const require = createRequire(import.meta.url);
const swaggerDir = dirname(require.resolve("swagger-ui-dist/package.json"));
const webDist = join(dirname(fileURLToPath(import.meta.url)), "../../web/dist");

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

declare module "fastify" {
  interface FastifyRequest {
    actor: UserRow | null;
  }
}

const loginAttempts = new Map<string, number[]>();

const contributionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("percent_of_premium"), employer_percent: z.number().min(0).max(100) }),
  z.object({ mode: z.literal("percent_of_employee_only"), employer_percent: z.number().min(0).max(100) }),
  z.object({ mode: z.literal("flat_per_employee"), amount_cents: z.number().int().nonnegative() }),
]);

const memberSchema = z.object({
  subscriber_id: z.string().min(1).max(64),
  relationship: z.enum(["self", "spouse", "child"]),
  first_name: z.string().min(1).max(80),
  last_name: z.string().min(1).max(80),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  zip: z.string().regex(/^\d{5}$/),
  gender: z.enum(["female", "male", "unknown"]).optional(),
  tobacco: z.boolean().optional(),
  annual_salary_cents: z.number().int().nonnegative().nullable().optional(),
  email: z.string().email().nullable().optional(),
  waived: z.boolean().optional(),
});

const medicalPlanSchema = z.object({
  id: z.string().min(1),
  line: z.literal("medical"),
  name: z.string().min(1),
  carrier: z.string().min(1),
  metal: z.enum(["bronze", "silver", "gold", "platinum"]),
  plan_type: z.enum(["PPO", "HMO", "EPO", "HDHP"]),
  deductible_individual_cents: z.number().int().nonnegative(),
  deductible_family_cents: z.number().int().nonnegative(),
  oop_individual_cents: z.number().int().nonnegative(),
  coinsurance: z.number().min(0).max(1),
  pcp_copay_cents: z.number().int().nonnegative(),
  specialist_copay_cents: z.number().int().nonnegative(),
  rx_generic_cents: z.number().int().nonnegative(),
  hsa_eligible: z.boolean(),
  base_rate_cents: z.number().int().positive(),
  actuarial_value: z.number().min(0).max(1),
  rate_basis: z.enum(["illustrative_sample", "agency_loaded"]).default("agency_loaded"),
});

const ancillaryPlanSchema = z.object({
  id: z.string().min(1),
  line: z.enum(["dental", "vision"]),
  name: z.string().min(1),
  carrier: z.string().min(1),
  plan_type: z.string().min(1),
  deductible_cents: z.number().int().nonnegative(),
  annual_max_cents: z.number().int().nonnegative().nullable(),
  preventive: z.string(),
  summary: z.string(),
  tier_rates_cents: z.object({
    employee_only: z.number().int().nonnegative(),
    employee_spouse: z.number().int().nonnegative(),
    employee_children: z.number().int().nonnegative(),
    employee_family: z.number().int().nonnegative(),
  }),
  richness: z.number().min(0).max(1),
  rate_basis: z.enum(["illustrative_sample", "agency_loaded"]).default("agency_loaded"),
});

export async function buildApp(deps: {
  config: AppConfig;
  store: Store;
  finch?: FinchClient | null;
}): Promise<FastifyInstance> {
  const { config, store } = deps;
  const finch = deps.finch ?? null;
  const app = Fastify({
    logger: {
      level: config.nodeEnv === "test" ? "silent" : "info",
      redact: ["req.headers.authorization"],
    },
    bodyLimit: 2 * 1024 * 1024,
  });
  app.decorateRequest("actor", null);
  app.addContentTypeParser("text/csv", { parseAs: "string" }, (_request, body, done) => {
    done(null, body);
  });
  await app.register(multipart, { limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(422).send({
        error: { code: "validation_error", message: "Request validation failed", details: error.issues },
      });
    }
    if (error instanceof CensusError) {
      return reply.code(422).send({
        error: { code: "invalid_census", message: error.message, details: error.details },
      });
    }
    if (error instanceof HttpError) {
      return reply.code(error.status).send({
        error: { code: error.code, message: error.message, details: error.details ?? null },
      });
    }
    if (error instanceof FinchError) {
      const status = error.status >= 400 && error.status < 500 ? 422 : 502;
      return reply.code(status).send({
        error: { code: error.code, message: error.message },
      });
    }
    request.log.error({ err: error }, "request failed");
    return reply.code(500).send({ error: { code: "internal", message: "Internal error" } });
  });

  app.addHook("onRequest", (request, reply, done) => {
    reply.header("access-control-allow-origin", config.webOrigin);
    reply.header("access-control-allow-headers", "authorization, content-type, idempotency-key");
    reply.header("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
    reply.header("x-frame-options", "SAMEORIGIN");
    if (request.method === "OPTIONS") {
      reply.code(204).send();
      return;
    }
    done();
  });

  app.addHook("preHandler", async (request) => {
    request.actor = await actorFrom(request, store);
  });

  app.get("/health", async () => {
    await store.countUsers();
    return { ok: true, service: "harbor-agency" };
  });

  app.get("/v1/openapi.json", async () => openApiDocument);

  app.get("/docs", async (_request, reply) => {
    reply.type("text/html").send(docsHtml);
  });

  await app.register(fastifyStatic, { root: swaggerDir, prefix: "/docs/ui/", decorateReply: false });

  app.post("/v1/auth/login", async (request, reply) => {
    const ip = request.ip;
    if (tooManyLogins(ip)) throw new HttpError(429, "rate_limited", "Too many login attempts. Try again in a minute.");
    const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(request.body);
    const user = await store.findUserByEmail(body.email.toLowerCase());
    const valid = user ? await bcrypt.compare(body.password, user.passwordHash) : false;
    if (!user || !valid) throw new HttpError(401, "invalid_login", "Email or password is incorrect");
    const token = randomToken(32);
    const now = new Date();
    const expires = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    await store.createSession({
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: expires.toISOString(),
      createdAt: now.toISOString(),
    });
    return reply.send({ token, expires_at: expires.toISOString(), user: publicUser(user) });
  });

  app.get("/v1/me", async (request) => {
    return { user: publicUser(requireActor(request)) };
  });

  app.get("/v1/api-keys", async (request) => {
    const actor = requireActor(request);
    return { api_keys: await store.listApiKeys(actor.id) };
  });

  app.post("/v1/api-keys", async (request, reply) => {
    const actor = requireActor(request);
    const body = z.object({ name: z.string().min(1).max(80) }).parse(request.body);
    const created = apiKey();
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await store.createApiKey({ id, userId: actor.id, name: body.name, prefix: created.prefix, tokenHash: created.hash, createdAt });
    return reply.code(201).send({ id, name: body.name, prefix: created.prefix, token: created.token, created_at: createdAt });
  });

  app.delete("/v1/api-keys/:id", async (request, reply) => {
    const actor = requireActor(request);
    const params = z.object({ id: z.string() }).parse(request.params);
    const revoked = await store.revokeApiKey(params.id, actor.id, new Date().toISOString());
    if (!revoked) throw new HttpError(404, "not_found", "API key not found");
    return reply.code(204).send();
  });

  app.get("/v1/groups", async (request) => {
    const actor = requireActor(request);
    const groups = await store.listGroups(actor.role === "admin" ? null : actor.id);
    return { groups: groups.map(publicGroup) };
  });

  app.post("/v1/groups", async (request, reply) => {
    const actor = requireActor(request);
    const body = z.object({
      legal_name: z.string().min(1).max(160),
      dba: z.string().max(160).nullable().optional(),
      sic: z.string().max(10).nullable().optional(),
      state: z.string().regex(/^[A-Za-z]{2}$/),
      zip: z.string().regex(/^\d{5}$/),
      effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(request.body);
    parseIsoDate(body.effective_date);
    const now = new Date().toISOString();
    const group = {
      id: crypto.randomUUID(),
      ownerId: actor.id,
      legalName: body.legal_name,
      dba: body.dba ?? null,
      sic: body.sic ?? null,
      state: body.state.toUpperCase(),
      zip: body.zip,
      effectiveDate: body.effective_date,
      finchCustomerId: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    await store.createGroup(group);
    return reply.code(201).send({ group: publicGroup(group) });
  });

  app.get("/v1/groups/:id", async (request) => {
    const group = await loadGroup(request, store);
    const census = await store.listCensus(group.id);
    return { group: publicGroup(group), census_count: census.length };
  });

  app.get("/v1/groups/:id/census", async (request) => {
    const group = await loadGroup(request, store);
    const members = await store.listCensus(group.id);
    return { members: members.map(publicMember) };
  });

  app.put("/v1/groups/:id/census", async (request) => {
    const group = await loadGroup(request, store);
    const drafts = await readCensus(request);
    const members = await store.replaceCensus(group.id, drafts, contentSource(request), new Date().toISOString());
    return { members: members.map(publicMember), count: members.length };
  });

  app.get("/v1/groups/:id/quotes", async (request) => {
    const group = await loadGroup(request, store);
    const quotes = await store.listQuotes(group.id);
    return {
      quotes: quotes.map((quote) => {
        const document = JSON.parse(quote.resultJson) as PublicQuote;
        return {
          id: quote.id,
          group_id: quote.groupId,
          created_at: quote.createdAt,
          effective_date: quote.effectiveDate,
          illustrative: document.illustrative,
          monthly_premium_cents: document.recommendation.combined.monthly_premium_cents,
          employer_monthly_cents: document.recommendation.combined.employer_monthly_cents,
          employee_monthly_cents: document.recommendation.combined.employee_monthly_cents,
          selections: document.recommendation.selections.map((selection) => ({
            line: selection.line,
            name: selection.name,
          })),
        };
      }),
    };
  });

  app.post("/v1/groups/:id/quotes", async (request, reply) => {
    const actor = requireActor(request);
    const group = await loadGroup(request, store);
    const idempotencyKey = headerValue(request.headers["idempotency-key"]);
    if (idempotencyKey) {
      const existing = await store.findQuoteByIdempotency(actor.id, idempotencyKey);
      if (existing) return reply.code(200).send({ quote: JSON.parse(existing.resultJson) });
    }
    const body = z.object({
      effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      plan_ids: z.array(z.string()).optional(),
      contribution: contributionSchema,
      preferences: z.object({
        prioritize: z.enum(["cost", "balanced", "richness"]).default("balanced"),
        employer_budget_monthly_cents: z.number().int().positive().optional(),
        hsa_preference: z.boolean().optional(),
      }).default({ prioritize: "balanced" }),
    }).parse(request.body ?? {});
    const effectiveDate = body.effective_date ?? group.effectiveDate;
    parseIsoDate(effectiveDate);
    const members = await store.listCensus(group.id);
    if (!members.length) throw new HttpError(422, "census_required", "Upload a census before quoting");
    const catalog = await store.listPlans();
    const plans = body.plan_ids?.length ? catalog.filter((plan) => body.plan_ids?.includes(plan.id)) : catalog;
    if (!plans.length) throw new HttpError(422, "no_plans", "No plans matched plan_ids");
    const contribution = toContribution(body.contribution);
    const preferences: RecommendPreferences = {
      prioritize: body.preferences.prioritize,
      employerBudgetMonthlyCents: body.preferences.employer_budget_monthly_cents,
      hsaPreference: body.preferences.hsa_preference,
    };
    let result;
    try {
      result = rateQuote({
        members,
        plans,
        areas: await store.listAreas(),
        effectiveDate,
        contribution,
        employerZip: group.zip,
        ratingRegionByZip: await store.ratingRegionMap(),
      });
    } catch (error) {
      throw new HttpError(422, "quote_failed", error instanceof Error ? error.message : "Quote failed");
    }
    const recommendation = await narrateRecommendation(recommendPlans(result.plans, preferences), preferences, config.ai);
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const document = publicQuoteDocument({ id, groupId: group.id, createdAt, result, recommendation });
    await store.createQuote({
      id,
      groupId: group.id,
      createdBy: actor.id,
      idempotencyKey: idempotencyKey ?? null,
      effectiveDate,
      contributionJson: JSON.stringify(contribution),
      preferencesJson: JSON.stringify(preferences),
      resultJson: JSON.stringify(document),
      recommendationJson: JSON.stringify(document.recommendation),
      createdAt,
    });
    return reply.code(201).send({ quote: document });
  });

  app.get("/v1/quotes/:id", async (request, reply) => {
    const actor = requireActor(request);
    const params = z.object({ id: z.string() }).parse(request.params);
    const quote = await store.getQuote(params.id);
    if (!quote) throw new HttpError(404, "not_found", "Quote not found");
    await loadGroupId(actor, store, quote.groupId);
    const document = JSON.parse(quote.resultJson) as PublicQuote;
    const format = typeof request.query === "object" && request.query && "format" in request.query
      ? String((request.query as { format?: string }).format ?? "")
      : "";
    if (format === "csv") {
      return reply.type("text/csv").header("content-disposition", `attachment; filename="quote-${quote.id}.csv"`).send(quoteCsv(document));
    }
    return { quote: document };
  });

  app.get("/v1/plans", async (request) => {
    requireActor(request);
    return { plans: (await store.listPlans()).map(publicCatalogPlan) };
  });

  app.post("/v1/plans", async (request) => {
    requireAdmin(request);
    const body = z.object({
      plans: z.array(z.union([medicalPlanSchema, ancillaryPlanSchema])).min(1),
    }).parse(request.body);
    await store.upsertPlans(body.plans.map(toPlan));
    return { plans: (await store.listPlans()).map(publicCatalogPlan) };
  });

  app.post("/v1/catalog/reset-sample", async (request) => {
    requireAdmin(request);
    await store.replacePlans(samplePlans());
    await store.replaceAreas(sampleAreaFactors());
    return { plans: (await store.listPlans()).map(publicCatalogPlan), rating_areas: await store.listAreas() };
  });

  app.get("/v1/rating-areas", async (request) => {
    requireActor(request);
    const areas = await store.listAreas();
    return { rating_areas: areas.map(publicArea), sample: areas.some((area) => area.source === "illustrative_sample") };
  });

  app.post("/v1/rating-areas", async (request) => {
    requireAdmin(request);
    const body = z.object({
      factors: z.array(z.object({
        zip: z.string().regex(/^\d{5}$/),
        state: z.string().regex(/^[A-Za-z]{2}$/),
        rating_area: z.string().min(1).max(40),
        factor: z.number().positive().max(5),
        source: z.enum(["illustrative_sample", "agency_loaded"]).default("agency_loaded"),
      })).min(1),
    }).parse(request.body);
    await store.upsertAreas(body.factors.map((factor) => ({
      zip: factor.zip,
      state: factor.state.toUpperCase(),
      ratingArea: factor.rating_area,
      factor: factor.factor,
      source: factor.source,
    })));
    return { rating_areas: (await store.listAreas()).map(publicArea) };
  });

  app.get("/v1/groups/:id/finch", async (request) => {
    const group = await loadGroup(request, store);
    const connection = await store.getFinchConnection(group.id);
    return {
      configured: finchConfigured(config) || Boolean(finch),
      connected: Boolean(connection),
      provider_id: connection?.providerId ?? null,
      products: connection?.products ?? [],
      last_synced_at: connection?.lastSyncedAt ?? null,
      company: connection?.companyJson ? JSON.parse(connection.companyJson) : null,
      benefits: await store.latestBenefits(group.id),
    };
  });

  app.post("/v1/groups/:id/finch/session", async (request) => {
    const group = await loadGroup(request, store);
    const client = requireFinch(finch, config);
    const session = await client.createSession({
      customerId: group.finchCustomerId,
      customerName: group.legalName,
    });
    return { session_id: session.sessionId, connect_url: session.connectUrl };
  });

  app.post("/v1/groups/:id/finch/exchange", async (request) => {
    const group = await loadGroup(request, store);
    const client = requireFinch(finch, config);
    const body = z.object({ code: z.string().min(1) }).parse(request.body);
    const token = await client.exchangeCode(body.code);
    if (token.customerId && token.customerId !== group.finchCustomerId) {
      throw new HttpError(422, "finch_customer_mismatch", "This Finch authorization belongs to a different employer");
    }
    const now = new Date().toISOString();
    await store.saveFinchConnection({
      groupId: group.id,
      connectionId: token.connectionId,
      providerId: token.providerId,
      accessTokenCiphertext: encryptString(config.appSecret, token.accessToken),
      products: token.products,
      entityId: token.entityIds[0] ?? null,
      companyJson: null,
      lastSyncedAt: null,
      createdAt: now,
    });
    return {
      connected: true,
      provider_id: token.providerId,
      products: token.products,
    };
  });

  app.post("/v1/groups/:id/finch/sync", async (request) => {
    const group = await loadGroup(request, store);
    const client = requireFinch(finch, config);
    const connection = await store.getFinchConnection(group.id);
    if (!connection) throw new HttpError(422, "finch_not_connected", "Connect payroll with Finch before syncing");
    const accessToken = decryptString(config.appSecret, connection.accessTokenCiphertext);
    const pulled = await pullFinchCensus(client, accessToken, connection.entityId, group.zip);
    if (!pulled.census.members.length) {
      throw new HttpError(422, "finch_empty_census", "Finch returned no employees with a date of birth", pulled.census.warnings);
    }
    assertHouseholds(pulled.census.members);
    const now = new Date().toISOString();
    const members = await store.replaceCensus(group.id, pulled.census.members, "finch", now);
    await store.saveBenefitSnapshot(crypto.randomUUID(), group.id, now, {
      benefits: pulled.census.benefits,
      warnings: pulled.census.warnings,
    });
    await store.markFinchSynced(group.id, now, pulled.company ? JSON.stringify(pulled.company) : null);
    return {
      members: members.map(publicMember),
      count: members.length,
      benefits: pulled.census.benefits,
      warnings: pulled.census.warnings,
      company: pulled.company,
    };
  });

  if (existsSync(join(webDist, "index.html"))) {
    await app.register(fastifyStatic, { root: webDist, prefix: "/" });
  }

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/v1") || request.url.startsWith("/health") || request.url.startsWith("/docs")) {
      return reply.code(404).send({ error: { code: "not_found", message: "Not found" } });
    }
    const indexHtml = join(webDist, "index.html");
    if (existsSync(indexHtml)) return reply.type("text/html").send(readFileSync(indexHtml));
    return reply.code(404).send({ error: { code: "not_found", message: "Not found" } });
  });

  return app;
}

function requireActor(request: FastifyRequest): UserRow {
  if (!request.actor) throw new HttpError(401, "unauthorized", "Sign in or send an API key");
  return request.actor;
}

function requireAdmin(request: FastifyRequest): UserRow {
  const actor = requireActor(request);
  if (actor.role !== "admin") throw new HttpError(403, "forbidden", "An agency admin has to load rate tables");
  return actor;
}

async function loadGroup(request: FastifyRequest, store: Store) {
  const actor = requireActor(request);
  const params = z.object({ id: z.string() }).parse(request.params);
  return loadGroupId(actor, store, params.id);
}

async function loadGroupId(actor: UserRow, store: Store, id: string) {
  const group = await store.getGroup(id);
  if (!group || (actor.role !== "admin" && group.ownerId !== actor.id)) {
    throw new HttpError(404, "not_found", "Group not found");
  }
  return group;
}

async function actorFrom(request: FastifyRequest, store: Store): Promise<UserRow | null> {
  const header = request.headers.authorization;
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  if (token.startsWith("ag_live_")) return store.findApiKey(sha256(token));
  const session = await store.findSession(sha256(token));
  if (!session) return null;
  if (Date.parse(session.expiresAt) < Date.now()) return null;
  return session.user;
}

function tooManyLogins(ip: string): boolean {
  const now = Date.now();
  const recent = (loginAttempts.get(ip) ?? []).filter((stamp) => now - stamp < 60_000);
  recent.push(now);
  loginAttempts.set(ip, recent);
  return recent.length > 10;
}

function toContribution(input: z.infer<typeof contributionSchema>): Contribution {
  if (input.mode === "flat_per_employee") return { mode: input.mode, amountCents: input.amount_cents };
  return { mode: input.mode, employerPercent: input.employer_percent };
}

function toPlan(input: z.infer<typeof medicalPlanSchema> | z.infer<typeof ancillaryPlanSchema>): Plan {
  if (input.line === "medical") {
    const plan: MedicalPlan = {
      id: input.id,
      line: "medical",
      name: input.name,
      carrier: input.carrier,
      metal: input.metal,
      planType: input.plan_type,
      deductibleIndividualCents: input.deductible_individual_cents,
      deductibleFamilyCents: input.deductible_family_cents,
      oopIndividualCents: input.oop_individual_cents,
      coinsurance: input.coinsurance,
      pcpCopayCents: input.pcp_copay_cents,
      specialistCopayCents: input.specialist_copay_cents,
      rxGenericCents: input.rx_generic_cents,
      hsaEligible: input.hsa_eligible,
      baseRateCents: input.base_rate_cents,
      actuarialValue: input.actuarial_value,
      rateBasis: input.rate_basis,
    };
    return plan;
  }
  const plan: AncillaryPlan = {
    id: input.id,
    line: input.line,
    name: input.name,
    carrier: input.carrier,
    planType: input.plan_type,
    deductibleCents: input.deductible_cents,
    annualMaxCents: input.annual_max_cents,
    preventive: input.preventive,
    summary: input.summary,
    tierRatesCents: input.tier_rates_cents,
    richness: input.richness,
    rateBasis: input.rate_basis,
  };
  return plan;
}

async function readCensus(request: FastifyRequest): Promise<CensusDraft[]> {
  const type = request.headers["content-type"] ?? "";
  if (type.includes("text/csv") && typeof request.body === "string") {
    return parseCensusCsv(request.body);
  }
  if (type.includes("multipart/form-data")) {
    const file = await request.file();
    if (!file) throw new HttpError(422, "invalid_census", "Attach a CSV file in the file field");
    const text = (await file.toBuffer()).toString("utf8");
    return parseCensusCsv(text);
  }
  const body = z.object({ members: z.array(memberSchema).min(1).max(5000) }).parse(request.body);
  const drafts = body.members.map(draftFromPublic);
  assertHouseholds(drafts);
  return drafts;
}

function contentSource(request: FastifyRequest): string {
  const type = request.headers["content-type"] ?? "";
  if (type.includes("text/csv") || type.includes("multipart")) return "csv";
  return "json";
}

function requireFinch(client: FinchClient | null, config: AppConfig): FinchClient {
  if (client) return client;
  if (!finchConfigured(config)) {
    throw new HttpError(503, "finch_not_configured", "Set FINCH_CLIENT_ID, FINCH_CLIENT_SECRET, and FINCH_REDIRECT_URI");
  }
  return new FinchClient({ ...config.finch, sandbox: config.finch.sandbox });
}

function publicUser(user: UserRow) {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

function publicGroup(group: {
  id: string;
  legalName: string;
  dba: string | null;
  sic: string | null;
  state: string;
  zip: string;
  effectiveDate: string;
  createdAt: string;
  updatedAt: string;
}) {
  return {
    id: group.id,
    legal_name: group.legalName,
    dba: group.dba,
    sic: group.sic,
    state: group.state,
    zip: group.zip,
    effective_date: group.effectiveDate,
    created_at: group.createdAt,
    updated_at: group.updatedAt,
  };
}

function publicCatalogPlan(plan: Plan) {
  if (plan.line === "medical") {
    return {
      id: plan.id,
      line: plan.line,
      name: plan.name,
      carrier: plan.carrier,
      metal: plan.metal,
      plan_type: plan.planType,
      deductible_individual_cents: plan.deductibleIndividualCents,
      oop_individual_cents: plan.oopIndividualCents,
      coinsurance: plan.coinsurance,
      hsa_eligible: plan.hsaEligible,
      base_rate_cents: plan.baseRateCents,
      rate_basis: plan.rateBasis,
      rate_label: plan.rateLabel ?? null,
    };
  }
  return {
    id: plan.id,
    line: plan.line,
    name: plan.name,
    carrier: plan.carrier,
    plan_type: plan.planType,
    deductible_cents: plan.deductibleCents,
    annual_max_cents: plan.annualMaxCents,
    tier_rates_cents: plan.tierRatesCents,
    rate_basis: plan.rateBasis,
    rate_label: plan.rateLabel ?? null,
  };
}

function publicArea(area: AreaFactor) {
  return {
    zip: area.zip,
    state: area.state,
    rating_area: area.ratingArea,
    factor: area.factor,
    source: area.source,
  };
}

function headerValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const docsHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Harbor Agency API</title>
  <link rel="stylesheet" href="/docs/ui/swagger-ui.css" />
</head>
<body>
  <div id="swagger"></div>
  <script src="/docs/ui/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({ url: "/v1/openapi.json", dom_id: "#swagger" });
  </script>
</body>
</html>`;
