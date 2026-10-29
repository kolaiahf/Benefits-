export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface Group {
  id: string;
  legal_name: string;
  dba: string | null;
  sic: string | null;
  state: string;
  zip: string;
  effective_date: string;
  created_at: string;
}

export interface Member {
  id: string;
  subscriber_id: string;
  relationship: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  zip: string;
  tobacco: boolean;
  annual_salary_cents: number | null;
  waived: boolean;
}

export interface RatedPlan {
  plan_id: string;
  line: "medical" | "dental" | "vision";
  name: string;
  carrier: string;
  rate_basis: string;
  rate_label: string | null;
  monthly_premium_cents: number;
  employer_monthly_cents: number;
  employee_monthly_cents: number;
  pepm_cents: number;
  highlights: {
    plan_type: string;
    metal: string | null;
    deductible_individual_cents: number | null;
    oop_individual_cents: number | null;
    hsa_eligible: boolean;
    annual_max_cents: number | null;
  };
  households: Array<{
    name: string;
    tier: string;
    monthly_premium_cents: number;
    employer_cents: number;
    employee_cents: number;
    members: Array<{ name: string; relationship: string; age: number; monthly_cents: number; capped: boolean }>;
  }>;
}

export interface Quote {
  id: string;
  illustrative: boolean;
  filed: boolean;
  rating_region: string | null;
  effective_date: string;
  enrolled_employees: number;
  eligible_employees: number;
  participation: number;
  warnings: Array<{ code: string; message: string }>;
  plans: RatedPlan[];
  recommendation: {
    within_budget: boolean | null;
    narrative: { text: string; source: string };
    combined: {
      monthly_premium_cents: number;
      employer_monthly_cents: number;
      employee_monthly_cents: number;
      annual_employer_cents: number;
    };
    selections: Array<{
      line: string;
      plan_id: string;
      name: string;
      carrier: string;
      reasons: string[];
      monthly_premium_cents: number;
      employer_monthly_cents: number;
      employee_monthly_cents: number;
    }>;
  };
}

export interface CatalogPlan {
  id: string;
  line: "medical" | "dental" | "vision";
  name: string;
  carrier: string;
  rate_basis: string;
  rate_label: string | null;
}

export interface FinchStatus {
  configured: boolean;
  connected: boolean;
  provider_id: string | null;
  last_synced_at: string | null;
  benefits: { benefits?: Array<{ line: string; name: string; carrier: string | null; enrolled: number; employee_contribution_cents: number | null; employer_contribution_cents: number | null }>; warnings?: string[] } | null;
}

const TOKEN_KEY = "harbor_token";

export function authToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function send<T>(path: string, init: RequestInit = {}, authenticate = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (authenticate) {
    const token = authToken();
    if (token) headers.set("authorization", `Bearer ${token}`);
  }
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(path, { ...init, headers });
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const payload = text ? JSON.parse(text) as { error?: { message?: string; code?: string } } : {};
  if (!response.ok) {
    throw new ApiError(payload.error?.message ?? response.statusText, response.status, payload.error?.code ?? "error");
  }
  return payload as T;
}

export const api = {
  login(email: string, password: string) {
    return send<{ token: string; user: User }>("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }, false);
  },
  me() {
    return send<{ user: User }>("/v1/me");
  },
  groups() {
    return send<{ groups: Group[] }>("/v1/groups");
  },
  createGroup(body: { legal_name: string; state: string; zip: string; effective_date: string; sic?: string }) {
    return send<{ group: Group }>("/v1/groups", { method: "POST", body: JSON.stringify(body) });
  },
  census(groupId: string) {
    return send<{ members: Member[] }>(`/v1/groups/${groupId}/census`);
  },
  uploadCensus(groupId: string, csv: string) {
    return send<{ members: Member[]; count: number }>(`/v1/groups/${groupId}/census`, {
      method: "PUT",
      headers: { "content-type": "text/csv" },
      body: csv,
    });
  },
  plans() {
    return send<{ plans: CatalogPlan[] }>("/v1/plans");
  },
  quote(groupId: string, body: unknown) {
    return send<{ quote: Quote }>(`/v1/groups/${groupId}/quotes`, { method: "POST", body: JSON.stringify(body) });
  },
  finch(groupId: string) {
    return send<FinchStatus>(`/v1/groups/${groupId}/finch`);
  },
  finchSession(groupId: string) {
    return send<{ connect_url: string }>(`/v1/groups/${groupId}/finch/session`, { method: "POST", body: "{}" });
  },
  finchExchange(groupId: string, code: string) {
    return send(`/v1/groups/${groupId}/finch/exchange`, { method: "POST", body: JSON.stringify({ code }) });
  },
  finchSync(groupId: string) {
    return send<{ count: number; warnings: string[] }>(`/v1/groups/${groupId}/finch/sync`, { method: "POST", body: "{}" });
  },
};
