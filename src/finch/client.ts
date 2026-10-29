const API_VERSION = "2020-09-17";

export interface FinchConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  apiBase: string;
  sandbox: "finch" | "provider" | "";
  fetchImpl?: typeof fetch;
}

export class FinchError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "FinchError";
  }
}

export interface ConnectSession {
  sessionId: string;
  connectUrl: string;
}

export interface FinchToken {
  accessToken: string;
  connectionId: string | null;
  providerId: string | null;
  products: string[];
  entityIds: string[];
  customerId: string | null;
}

export interface FinchDirectoryPerson {
  id: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
}

export interface FinchIndividual {
  id: string;
  firstName: string;
  lastName: string;
  dob: string | null;
  gender: string | null;
  postalCode: string | null;
  email: string | null;
}

export interface FinchEmployment {
  id: string;
  isActive: boolean;
  income: { amount: number; unit: string; currency: string } | null;
  title: string | null;
}

export interface FinchPlan {
  id: string;
  type: string;
  name: string;
  carrier: string | null;
}

export interface FinchEnrollment {
  id: string;
  individualId: string;
  planId: string;
  coverageTier: string | null;
  status: string | null;
  employeeContributionCents: number | null;
  employerContributionCents: number | null;
  frequency: string | null;
  dependentIds: string[];
}

export interface FinchDependent {
  id: string;
  individualId: string | null;
  firstName: string;
  lastName: string;
  dob: string | null;
  relationship: string | null;
}

export interface FinchCompany {
  id: string | null;
  legalName: string | null;
  ein: string | null;
}

interface JsonObject {
  [key: string]: unknown;
}

export class FinchClient {
  constructor(private readonly config: FinchConfig) {}

  async createSession(input: {
    customerId: string;
    customerName: string;
    customerEmail?: string;
  }): Promise<ConnectSession> {
    const body: JsonObject = {
      customer_id: input.customerId,
      customer_name: input.customerName,
      products: ["company", "directory", "individual", "employment", "benefits"],
      redirect_uri: this.config.redirectUri,
      manual: true,
    };
    if (input.customerEmail) body.customer_email = input.customerEmail;
    if (this.config.sandbox) body.sandbox = this.config.sandbox;
    const payload = await this.request<JsonObject>("/connect/sessions", {
      method: "POST",
      body,
      auth: "basic",
    });
    const sessionId = stringField(payload, "session_id");
    const connectUrl = stringField(payload, "connect_url");
    if (!sessionId || !connectUrl) {
      throw new FinchError("Finch did not return a connect session", 502, "finch_bad_response");
    }
    return { sessionId, connectUrl };
  }

  async exchangeCode(code: string): Promise<FinchToken> {
    const payload = await this.request<JsonObject>("/auth/token", {
      method: "POST",
      body: {
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
      },
      auth: "none",
    });
    const accessToken = stringField(payload, "access_token");
    if (!accessToken) throw new FinchError("Finch did not return an access token", 502, "finch_bad_response");
    return {
      accessToken,
      connectionId: stringField(payload, "connection_id"),
      providerId: stringField(payload, "provider_id"),
      products: stringArray(payload.products),
      entityIds: stringArray(payload.entity_ids),
      customerId: stringField(payload, "customer_id"),
    };
  }

  async directory(token: string, entityId?: string | null): Promise<FinchDirectoryPerson[]> {
    const people: FinchDirectoryPerson[] = [];
    let offset = 0;
    const limit = 200;
    for (;;) {
      const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (entityId) query.set("entity_ids", entityId);
      const payload = await this.request<JsonObject>(`/employer/directory?${query}`, {
        method: "GET",
        auth: "bearer",
        token,
      });
      const individuals = arrayField(payload, "individuals");
      for (const row of individuals) {
        const id = stringField(row, "id");
        if (!id) continue;
        people.push({
          id,
          firstName: stringField(row, "first_name") ?? "",
          lastName: stringField(row, "last_name") ?? "",
          isActive: row.is_active !== false,
        });
      }
      if (individuals.length < limit) break;
      offset += individuals.length;
      if (offset > 20_000) break;
    }
    return people;
  }

  async individuals(token: string, ids: string[], entityId?: string | null): Promise<FinchIndividual[]> {
    const rows = await this.batch(token, "/employer/individual", "individual_id", ids, entityId);
    return rows.map((row) => ({
      id: stringField(row, "id") ?? stringField(row, "individual_id") ?? "",
      firstName: stringField(row, "first_name") ?? "",
      lastName: stringField(row, "last_name") ?? "",
      dob: stringField(row, "dob"),
      gender: stringField(row, "gender"),
      postalCode: postalCode(row.residence),
      email: firstEmail(row.emails),
    })).filter((row) => row.id);
  }

  async employment(token: string, ids: string[], entityId?: string | null): Promise<FinchEmployment[]> {
    const rows = await this.batch(token, "/employer/employment", "individual_id", ids, entityId);
    return rows.map((row) => {
      const income = isObject(row.income) ? row.income : null;
      return {
        id: stringField(row, "id") ?? "",
        isActive: row.is_active !== false,
        title: stringField(row, "title"),
        income: income
          ? {
              amount: numberField(income, "amount") ?? 0,
              unit: stringField(income, "unit") ?? "yearly",
              currency: stringField(income, "currency") ?? "usd",
            }
          : null,
      };
    }).filter((row) => row.id);
  }

  async company(token: string, entityId?: string | null): Promise<FinchCompany> {
    const query = entityId ? `?entity_ids=${encodeURIComponent(entityId)}` : "";
    const payload = await this.request<JsonObject>(`/employer/company${query}`, {
      method: "GET",
      auth: "bearer",
      token,
    });
    return {
      id: stringField(payload, "id"),
      legalName: stringField(payload, "legal_name"),
      ein: stringField(payload, "ein"),
    };
  }

  async plans(token: string, entityId?: string | null): Promise<FinchPlan[]> {
    const plans: FinchPlan[] = [];
    let offset = 0;
    const limit = 50;
    for (;;) {
      const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (entityId) query.set("entity_ids", entityId);
      const payload = await this.request<JsonObject>(`/employer/plans?${query}`, {
        method: "GET",
        auth: "bearer",
        token,
      });
      const rows = arrayField(payload, "plans");
      if (!rows.length && offset === 0 && Array.isArray(payload)) break;
      for (const row of rows) {
        const id = stringField(row, "id") ?? stringField(row, "plan_id");
        if (!id) continue;
        const carrier = isObject(row.carrier) ? stringField(row.carrier, "name") : stringField(row, "carrier");
        plans.push({
          id,
          type: (stringField(row, "type") ?? stringField(row, "plan_type") ?? "other").toLowerCase(),
          name: stringField(row, "name") ?? stringField(row, "description") ?? "Benefit plan",
          carrier,
        });
      }
      if (rows.length < limit) break;
      offset += rows.length;
    }
    return plans;
  }

  async enrollments(token: string, entityId?: string | null): Promise<FinchEnrollment[]> {
    const enrollments: FinchEnrollment[] = [];
    let offset = 0;
    const limit = 50;
    for (;;) {
      const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (entityId) query.set("entity_ids", entityId);
      const payload = await this.request<JsonObject>(`/employer/plans-enrollments?${query}`, {
        method: "GET",
        auth: "bearer",
        token,
      });
      const rows = arrayField(payload, "enrollments");
      for (const row of rows) {
        const contributions = isObject(row.contributions) ? row.contributions : null;
        const employee = contributions && isObject(contributions.employee_contribution) ? contributions.employee_contribution : null;
        const employer = contributions && isObject(contributions.employer_contribution) ? contributions.employer_contribution : null;
        const id = stringField(row, "id");
        const individualId = stringField(row, "individual_id");
        const planId = stringField(row, "plan_id");
        if (!id || !individualId || !planId) continue;
        enrollments.push({
          id,
          individualId,
          planId,
          coverageTier: stringField(row, "coverage_tier"),
          status: stringField(row, "status"),
          employeeContributionCents: employee ? numberField(employee, "amount") : null,
          employerContributionCents: employer ? numberField(employer, "amount") : null,
          frequency: contributions ? stringField(contributions, "frequency") : null,
          dependentIds: stringArray(row.dependent_ids),
        });
      }
      if (rows.length < limit) break;
      offset += rows.length;
      if (offset > 20_000) break;
    }
    return enrollments;
  }

  async dependents(token: string, entityId?: string | null): Promise<FinchDependent[]> {
    const dependents: FinchDependent[] = [];
    let offset = 0;
    const limit = 50;
    for (;;) {
      const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (entityId) query.set("entity_ids", entityId);
      const payload = await this.request<JsonObject>(`/employer/plans-dependents?${query}`, {
        method: "GET",
        auth: "bearer",
        token,
      });
      const rows = arrayField(payload, "dependents");
      for (const row of rows) {
        const id = stringField(row, "id");
        if (!id) continue;
        dependents.push({
          id,
          individualId: stringField(row, "individual_id"),
          firstName: stringField(row, "first_name") ?? "",
          lastName: stringField(row, "last_name") ?? "",
          dob: stringField(row, "dob") ?? stringField(row, "date_of_birth"),
          relationship: stringField(row, "relationship"),
        });
      }
      if (rows.length < limit) break;
      offset += rows.length;
      if (offset > 20_000) break;
    }
    return dependents;
  }

  /** Older deductions product, used when the plans product is not enabled. */
  async deductionBenefits(token: string, entityId?: string | null): Promise<FinchPlan[]> {
    const query = entityId ? `?entity_ids=${encodeURIComponent(entityId)}` : "";
    const payload = await this.request<unknown>(`/employer/benefits${query}`, {
      method: "GET",
      auth: "bearer",
      token,
    });
    const rows = Array.isArray(payload) ? payload.filter(isObject) : arrayField(isObject(payload) ? payload : {}, "benefits");
    return rows.flatMap((row) => {
      const id = stringField(row, "benefit_id") ?? stringField(row, "id");
      if (!id) return [];
      return [{
        id,
        type: (stringField(row, "type") ?? "other").toLowerCase(),
        name: stringField(row, "description") ?? stringField(row, "type") ?? "Benefit",
        carrier: null,
      }];
    });
  }

  private async batch(
    token: string,
    path: string,
    idKey: string,
    ids: string[],
    entityId?: string | null,
  ): Promise<JsonObject[]> {
    const out: JsonObject[] = [];
    for (let index = 0; index < ids.length; index += 50) {
      const requests = ids.slice(index, index + 50).map((id) => ({ [idKey]: id }));
      const query = entityId ? `?entity_ids=${encodeURIComponent(entityId)}` : "";
      const payload = await this.request<JsonObject>(`${path}${query}`, {
        method: "POST",
        auth: "bearer",
        token,
        body: { requests },
      });
      for (const response of arrayField(payload, "responses")) {
        const code = numberField(response, "code") ?? 200;
        if (code >= 400 || !isObject(response.body)) continue;
        out.push(response.body);
      }
    }
    return out;
  }

  private async request<T>(
    path: string,
    options: { method: string; auth: "basic" | "bearer" | "none"; token?: string; body?: unknown },
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Finch-API-Version": API_VERSION,
      Accept: "application/json",
    };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (options.auth === "basic") {
      const credentials = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64");
      headers.Authorization = `Basic ${credentials}`;
    } else if (options.auth === "bearer") {
      headers.Authorization = `Bearer ${options.token}`;
    }
    const fetchImpl = this.config.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await fetchImpl(`${this.config.apiBase}${path}`, {
        method: options.method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "network error";
      throw new FinchError(`Finch request failed: ${message}`, 502, "finch_network");
    }
    const text = await response.text();
    const parsed = text ? safeJson(text) : {};
    if (!response.ok) {
      const message = isObject(parsed) ? stringField(parsed, "message") ?? response.statusText : response.statusText;
      throw new FinchError(message || "Finch request failed", response.status, "finch_http");
    }
    return parsed as T;
  }
}

export function annualSalaryCents(income: FinchEmployment["income"]): number | null {
  if (!income || income.currency.toLowerCase() !== "usd") return null;
  const multipliers: Record<string, number> = {
    yearly: 1,
    annually: 1,
    quarterly: 4,
    monthly: 12,
    semi_monthly: 24,
    biweekly: 26,
    bi_weekly: 26,
    weekly: 52,
    daily: 260,
    hourly: 2080,
  };
  const multiplier = multipliers[income.unit.toLowerCase()];
  if (!multiplier) return null;
  return Math.round(income.amount * multiplier);
}

function postalCode(value: unknown): string | null {
  if (!isObject(value)) return null;
  const raw = stringField(value, "postal_code");
  if (!raw) return null;
  const zip = raw.slice(0, 5);
  return /^\d{5}$/.test(zip) ? zip : null;
}

function firstEmail(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const entry of value) {
    if (!isObject(entry)) continue;
    const email = stringField(entry, "data") ?? stringField(entry, "email");
    if (email) return email;
  }
  return null;
}

function stringField(value: unknown, key: string): string | null {
  if (!isObject(value)) return null;
  const field = value[key];
  return typeof field === "string" && field.length ? field : null;
}

function numberField(value: unknown, key: string): number | null {
  if (!isObject(value)) return null;
  const field = value[key];
  return typeof field === "number" && Number.isFinite(field) ? field : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function arrayField(value: JsonObject, key: string): JsonObject[] {
  const field = value[key];
  if (!Array.isArray(field)) return [];
  return field.filter(isObject);
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}
