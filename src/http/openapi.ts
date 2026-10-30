export function openApiDocument(brand: { agencyName: string }) {
  return {
    ...document,
    info: { ...document.info, title: `${brand.agencyName} API` },
  };
}

const document = {
  openapi: "3.1.0",
  info: {
    title: "Agency API",
    version: "1.0.0",
    summary: "API-first small-group medical, dental, and vision quoting for a general agency.",
    description:
      "Quote small-group medical, dental, and vision from an uploaded census or a Finch payroll connection. Sample rate tables ship with the server and are labeled illustrative_sample. Load carrier rates before presenting a bindable quote. The console signs in with Supabase Auth. Other systems send an API key (Authorization: Bearer ag_live_...). POST /v1/auth/login is only available when password sign-in is turned on.",
  },
  servers: [{ url: "/" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer" },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/health": { get: { summary: "Liveness and database check", security: [], responses: { "200": { description: "Service is up" } } } },
    "/v1/auth/login": {
      post: { summary: "Local password session. Off when Supabase Auth is enabled.", security: [], responses: { "200": { description: "Session token" } } },
    },
    "/v1/me": { get: { summary: "Current broker", responses: { "200": { description: "Profile" } } } },
    "/v1/api-keys": {
      get: { summary: "List API keys", responses: { "200": { description: "Keys, without secrets" } } },
      post: { summary: "Create an API key. The secret is returned once.", responses: { "201": { description: "New key" } } },
    },
    "/v1/api-keys/{id}": { delete: { summary: "Revoke an API key", responses: { "204": { description: "Revoked" } } } },
    "/v1/groups": {
      get: { summary: "List employer groups", responses: { "200": { description: "Groups" } } },
      post: { summary: "Create an employer group", responses: { "201": { description: "Group" } } },
    },
    "/v1/groups/{id}": { get: { summary: "Get an employer group", responses: { "200": { description: "Group" } } } },
    "/v1/groups/{id}/census": {
      get: { summary: "List the current census", responses: { "200": { description: "Members" } } },
      put: { summary: "Replace the census with JSON or text/csv", responses: { "200": { description: "Stored census" } } },
    },
    "/v1/groups/{id}/quotes": {
      get: { summary: "List quotes for a group", responses: { "200": { description: "Quote summaries" } } },
      post: { summary: "Rate medical, dental, and vision plans and recommend a portfolio. Supports Idempotency-Key.", responses: { "201": { description: "Quote" } } },
    },
    "/v1/quotes/{id}": {
      get: { summary: "Get a quote. Use ?format=csv for a comparison spreadsheet.", responses: { "200": { description: "Quote" } } },
    },
    "/v1/plans": {
      get: { summary: "List the plan catalog", responses: { "200": { description: "Plans" } } },
      post: { summary: "Upsert agency rate tables. Admin only.", responses: { "200": { description: "Catalog" } } },
    },
    "/v1/rating-areas": {
      get: { summary: "List ZIP area factors", responses: { "200": { description: "Factors" } } },
      post: { summary: "Upsert ZIP area factors. Admin only.", responses: { "200": { description: "Factors" } } },
    },
    "/v1/groups/{id}/finch/session": {
      post: { summary: "Start a Finch Connect session for payroll and benefits", responses: { "200": { description: "connect_url" } } },
    },
    "/v1/groups/{id}/finch/exchange": {
      post: { summary: "Exchange a Finch authorization code and store the connection", responses: { "200": { description: "Connection status" } } },
    },
    "/v1/groups/{id}/finch/sync": {
      post: { summary: "Import the census and current benefit elections from Finch", responses: { "200": { description: "Census and benefits" } } },
    },
    "/v1/groups/{id}/finch": {
      get: { summary: "Finch connection status and last benefit snapshot", responses: { "200": { description: "Status" } } },
    },
  },
} as const;
