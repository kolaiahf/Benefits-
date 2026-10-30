import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { loadBrand } from "../brand.js";
import type { AppConfig } from "../config.js";
import { randomToken } from "../crypto.js";
import type { Store, UserRow } from "../db/store.js";
import { loadRateCatalog } from "../quoting/catalog.js";
import { CensusValidationError, parseQuoteCensus } from "../quoting/census.js";
import { buildQuoteDocument, QuoteInputError } from "../quoting/buildQuote.js";
import { renderQuotePdf } from "../quoting/pdf.js";
import type { QuoteDocument } from "../quoting/types.js";
import { HttpError } from "./errors.js";

interface StoredQuote {
  censusCsv: string;
  document: QuoteDocument;
}

const quoteBody = z.object({
  employer_name: z.string().trim().min(1).max(160),
  employer_zip: z.string().regex(/^\d{5}$/),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  census_csv: z.string().min(1).max(1_000_000),
  employer_employee_percent: z.number().min(0).max(100),
  employer_dependent_percent: z.number().min(0).max(100),
  current_plan_id: z.string().max(140).nullable().optional(),
  renewal_increase_percent: z.number().min(-50).max(100).nullable().optional(),
});

export function registerHarborRoutes(app: FastifyInstance, config: AppConfig, store: Store): void {
  app.get("/v1/small-group/quotes", async (request) => {
    const actor = requireActor(request);
    const quotes = await store.listHarborQuotes(actor);
    return { quotes };
  });

  app.post("/v1/small-group/quotes", async (request, reply) => {
    const actor = await actorWithAgency(request, store);
    const body = quoteBody.parse(request.body);
    const document = rateBody(body, actor);
    const id = crypto.randomUUID();
    document.id = id;
    const payload: StoredQuote = { censusCsv: body.census_csv, document };
    const createdAt = new Date().toISOString();
    await store.saveHarborQuote({
      id,
      agencyId: actor.agencyId,
      ownerId: actor.id,
      employerName: document.employerName,
      payloadJson: JSON.stringify(payload),
      createdAt,
    });
    return reply.code(201).send({ quote: document });
  });

  app.get("/v1/small-group/quotes/:id", async (request) => {
    const actor = requireActor(request);
    const stored = await loadStored(request, store, actor);
    return { quote: stored.document };
  });

  app.post("/v1/small-group/quotes/:id", async (request) => {
    const actor = requireActor(request);
    const stored = await loadStored(request, store, actor);
    const patch = z.object({
      current_plan_id: z.string().max(140).nullable().optional(),
      renewal_increase_percent: z.number().min(-50).max(100).nullable().optional(),
    }).parse(request.body);
    const document = rateBody({
      employer_name: stored.document.employerName,
      employer_zip: stored.document.employerZip,
      effective_date: stored.document.effectiveDate,
      census_csv: stored.censusCsv,
      employer_employee_percent: stored.document.contribution.employerEmployeePercent,
      employer_dependent_percent: stored.document.contribution.employerDependentPercent,
      current_plan_id: patch.current_plan_id === undefined ? stored.document.currentPlanId : patch.current_plan_id,
      renewal_increase_percent: patch.renewal_increase_percent === undefined ? stored.document.renewalIncreasePercent : patch.renewal_increase_percent,
    }, actor, stored.document.id);
    await store.replaceHarborQuote(stored.document.id, JSON.stringify({ censusCsv: stored.censusCsv, document }), document.employerName);
    return { quote: document };
  });

  app.get("/v1/small-group/quotes/:id/pdf", async (request, reply) => {
    const actor = requireActor(request);
    const stored = await loadStored(request, store, actor);
    const pdf = await renderQuotePdf(stored.document, loadBrand().productName);
    const filename = `${stored.document.employerName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "quote"}-proposal.pdf`;
    return reply
      .header("content-type", "application/pdf")
      .header("content-disposition", `attachment; filename="${filename}"`)
      .header("cache-control", "no-store")
      .send(pdf);
  });

  app.get("/v1/small-group/brokers", async (request) => {
    const actor = requireAdmin(request);
    if (!actor.agencyId) return { brokers: [] };
    const users = await store.listAgencyUsers(actor.agencyId);
    return {
      brokers: users.map((user) => ({ id: user.id, email: user.email, name: user.name, role: user.role })),
    };
  });

  app.post("/v1/small-group/brokers", async (request, reply) => {
    const actor = await actorWithAgency(request, store);
    if (actor.role !== "admin") throw new HttpError(403, "forbidden", "Only an agency admin can invite brokers.");
    const body = z.object({
      email: z.string().email().max(160),
      name: z.string().trim().min(1).max(80),
    }).parse(request.body);
    const email = body.email.toLowerCase();
    const existing = await store.findUserByEmail(email);
    if (existing) throw new HttpError(409, "already_registered", "That email already has an account.");
    // TODO: send this invite with Resend. Nothing is emailed in this version.
    const temporaryPassword = randomToken(12);
    await store.createUser({
      id: crypto.randomUUID(),
      email,
      name: body.name,
      passwordHash: await bcrypt.hash(temporaryPassword, config.bcryptRounds),
      role: "broker",
      createdAt: new Date().toISOString(),
    });
    const created = await store.findUserByEmail(email);
    if (!created || !actor.agencyId) throw new HttpError(500, "internal", "Could not create the broker.");
    await store.setUserAgency(created.id, actor.agencyId);
    return reply.code(201).send({
      broker: { id: created.id, email: created.email, name: created.name, role: "broker" },
      temporary_password: temporaryPassword,
    });
  });

  app.delete("/v1/small-group/brokers/:id", async (request, reply) => {
    const actor = requireAdmin(request);
    const params = z.object({ id: z.string() }).parse(request.params);
    if (params.id === actor.id) throw new HttpError(422, "invalid_request", "You can't remove your own account.");
    const users = actor.agencyId ? await store.listAgencyUsers(actor.agencyId) : [];
    const target = users.find((user) => user.id === params.id);
    if (!target) throw new HttpError(404, "not_found", "That broker is not in your agency.");
    await store.setUserAgency(target.id, null);
    return reply.code(204).send();
  });
}

function rateBody(body: z.infer<typeof quoteBody>, actor: UserRow, id = "pending"): QuoteDocument {
  try {
    const parsed = parseQuoteCensus(body.census_csv, body.effective_date);
    const catalog = loadRateCatalog();
    const periods = new Set<string>();
    const document = buildQuoteDocument({
      id,
      employerName: body.employer_name,
      employerZip: body.employer_zip,
      effectiveDate: body.effective_date,
      people: parsed.people,
      contribution: {
        employerEmployeePercent: body.employer_employee_percent,
        employerDependentPercent: body.employer_dependent_percent,
      },
      currentPlanId: body.current_plan_id,
      renewalIncreasePercent: body.renewal_increase_percent,
      preparedBy: { name: actor.name, email: actor.email },
      preparedOn: new Date().toISOString().slice(0, 10),
      catalog: catalog.plans,
      warnings: parsed.warnings,
    });
    for (const plan of document.plans) periods.add(plan.periodLabel);
    document.notes = [
      `Rating area ${document.ratingArea}. Periods that include this effective date: ${[...periods].join("; ")}.`,
      ...catalog.notes,
    ];
    return document;
  } catch (error) {
    if (error instanceof CensusValidationError) {
      throw new HttpError(422, "invalid_census", error.issues[0] ?? "Census could not be read", error.issues);
    }
    if (error instanceof QuoteInputError) throw new HttpError(422, "invalid_quote", error.message, error.issues);
    throw error;
  }
}

async function loadStored(request: { params: unknown; actor: UserRow | null }, store: Store, actor: UserRow): Promise<StoredQuote> {
  const params = z.object({ id: z.string() }).parse(request.params);
  const row = await store.getHarborQuote(params.id);
  if (!row || !canRead(actor, row)) throw new HttpError(404, "not_found", "Quote not found");
  const payload = JSON.parse(row.payloadJson) as StoredQuote;
  return payload;
}

function canRead(actor: UserRow, quote: { ownerId: string; agencyId: string | null }): boolean {
  if (quote.ownerId === actor.id) return true;
  return Boolean(actor.agencyId && quote.agencyId && actor.agencyId === quote.agencyId);
}

function requireActor(request: { actor: UserRow | null }): UserRow {
  if (!request.actor) throw new HttpError(401, "unauthorized", "Sign in or send an API key");
  return request.actor;
}

function requireAdmin(request: { actor: UserRow | null }): UserRow {
  const actor = requireActor(request);
  if (actor.role !== "admin") throw new HttpError(403, "forbidden", "Only an agency admin can manage brokers.");
  return actor;
}

async function actorWithAgency(request: { actor: UserRow | null }, store: Store): Promise<UserRow> {
  const actor = requireActor(request);
  if (actor.agencyId) return actor;
  if (actor.role !== "admin") return actor;
  await store.ensureAgency(actor.id, loadBrand().productName);
  const refreshed = await store.findUserById(actor.id);
  return refreshed ?? actor;
}
