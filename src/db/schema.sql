CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  legal_name TEXT NOT NULL,
  dba TEXT,
  sic TEXT,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  finch_customer_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS census_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  subscriber_id TEXT NOT NULL,
  relationship TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  zip TEXT NOT NULL,
  gender TEXT NOT NULL,
  tobacco INTEGER NOT NULL,
  annual_salary_cents INTEGER,
  email TEXT,
  waived INTEGER NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS census_group_idx ON census_members(group_id);

CREATE TABLE IF NOT EXISTS finch_connections (
  group_id TEXT PRIMARY KEY REFERENCES groups(id) ON DELETE CASCADE,
  connection_id TEXT,
  provider_id TEXT,
  access_token_ciphertext TEXT NOT NULL,
  products_json TEXT NOT NULL,
  entity_id TEXT,
  company_json TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS benefit_snapshots (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  synced_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  line TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  active INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS area_factors (
  zip TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  rating_area TEXT NOT NULL,
  factor REAL NOT NULL,
  source TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL,
  idempotency_key TEXT,
  effective_date TEXT NOT NULL,
  contribution_json TEXT NOT NULL,
  preferences_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  recommendation_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(created_by, idempotency_key)
);

CREATE INDEX IF NOT EXISTS quotes_group_idx ON quotes(group_id);
