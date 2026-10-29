import { createClient, type Client, type InValue } from "@libsql/client";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AreaFactor, Plan } from "../domain/types.js";
import type { CensusDraft } from "../domain/census.js";
import type { CensusMember } from "../domain/types.js";

const schemaSql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "schema.sql"), "utf8");

export interface UserRow {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: "admin" | "broker";
  createdAt: string;
}

export interface GroupRow {
  id: string;
  ownerId: string;
  legalName: string;
  dba: string | null;
  sic: string | null;
  state: string;
  zip: string;
  effectiveDate: string;
  finchCustomerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteRow {
  id: string;
  groupId: string;
  createdBy: string;
  idempotencyKey: string | null;
  effectiveDate: string;
  contributionJson: string;
  preferencesJson: string;
  resultJson: string;
  recommendationJson: string;
  createdAt: string;
}

export interface FinchConnectionRow {
  groupId: string;
  connectionId: string | null;
  providerId: string | null;
  accessTokenCiphertext: string;
  products: string[];
  entityId: string | null;
  companyJson: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
}

type SqlRow = Record<string, unknown>;

export class Store {
  private constructor(private readonly db: Client) {}

  static async open(databaseUrl: string): Promise<Store> {
    const db = createClient({ url: databaseUrl });
    const store = new Store(db);
    await store.migrate();
    return store;
  }

  async migrate(): Promise<void> {
    const statements = schemaSql
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);
    await this.db.batch(statements, "write");
  }

  async close(): Promise<void> {
    this.db.close();
  }

  async countUsers(): Promise<number> {
    return this.count("users");
  }

  async countPlans(): Promise<number> {
    return this.count("plans");
  }

  async countAreas(): Promise<number> {
    return this.count("area_factors");
  }

  async createUser(input: { id: string; email: string; name: string; passwordHash: string; role: "admin" | "broker"; createdAt: string }): Promise<void> {
    await this.run(
      "INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [input.id, input.email, input.name, input.passwordHash, input.role, input.createdAt],
    );
  }

  async findUserByEmail(email: string): Promise<UserRow | null> {
    const row = await this.one("SELECT * FROM users WHERE email = ?", [email.toLowerCase()]);
    return row ? mapUser(row) : null;
  }

  async findUserById(id: string): Promise<UserRow | null> {
    const row = await this.one("SELECT * FROM users WHERE id = ?", [id]);
    return row ? mapUser(row) : null;
  }

  async createSession(input: { id: string; userId: string; tokenHash: string; expiresAt: string; createdAt: string }): Promise<void> {
    await this.run(
      "INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
      [input.id, input.userId, input.tokenHash, input.expiresAt, input.createdAt],
    );
  }

  async findSession(tokenHash: string): Promise<{ user: UserRow; expiresAt: string } | null> {
    const row = await this.one(
      `SELECT users.*, sessions.expires_at AS session_expires
       FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ?`,
      [tokenHash],
    );
    if (!row) return null;
    return { user: mapUser(row), expiresAt: String(row.session_expires) };
  }

  async createApiKey(input: { id: string; userId: string; name: string; prefix: string; tokenHash: string; createdAt: string }): Promise<void> {
    await this.run(
      "INSERT INTO api_keys (id, user_id, name, prefix, token_hash, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, NULL)",
      [input.id, input.userId, input.name, input.prefix, input.tokenHash, input.createdAt],
    );
  }

  async listApiKeys(userId: string): Promise<Array<{ id: string; name: string; prefix: string; createdAt: string; revokedAt: string | null }>> {
    const rows = await this.many("SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC", [userId]);
    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      prefix: String(row.prefix),
      createdAt: String(row.created_at),
      revokedAt: row.revoked_at ? String(row.revoked_at) : null,
    }));
  }

  async findApiKey(tokenHash: string): Promise<UserRow | null> {
    const row = await this.one(
      `SELECT users.* FROM api_keys
       JOIN users ON users.id = api_keys.user_id
       WHERE api_keys.token_hash = ? AND api_keys.revoked_at IS NULL`,
      [tokenHash],
    );
    return row ? mapUser(row) : null;
  }

  async revokeApiKey(id: string, userId: string, revokedAt: string): Promise<boolean> {
    const result = await this.db.execute({
      sql: "UPDATE api_keys SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL",
      args: [revokedAt, id, userId],
    });
    return result.rowsAffected > 0;
  }

  async createGroup(group: GroupRow): Promise<void> {
    await this.run(
      `INSERT INTO groups (id, owner_id, legal_name, dba, sic, state, zip, effective_date, finch_customer_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [group.id, group.ownerId, group.legalName, group.dba, group.sic, group.state, group.zip, group.effectiveDate, group.finchCustomerId, group.createdAt, group.updatedAt],
    );
  }

  async listGroups(ownerId: string | null): Promise<GroupRow[]> {
    const rows = ownerId
      ? await this.many("SELECT * FROM groups WHERE owner_id = ? ORDER BY created_at DESC", [ownerId])
      : await this.many("SELECT * FROM groups ORDER BY created_at DESC", []);
    return rows.map(mapGroup);
  }

  async getGroup(id: string): Promise<GroupRow | null> {
    const row = await this.one("SELECT * FROM groups WHERE id = ?", [id]);
    return row ? mapGroup(row) : null;
  }

  async replaceCensus(groupId: string, members: CensusDraft[], source: string, createdAt: string): Promise<CensusMember[]> {
    const saved = members.map((member) => ({
      ...member,
      id: crypto.randomUUID(),
      source,
      createdAt,
    }));
    await this.db.batch([
      { sql: "DELETE FROM census_members WHERE group_id = ?", args: [groupId] },
      ...saved.map((member) => ({
        sql: `INSERT INTO census_members
          (id, group_id, subscriber_id, relationship, first_name, last_name, date_of_birth, zip, gender, tobacco, annual_salary_cents, email, waived, source, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          member.id,
          groupId,
          member.subscriberId,
          member.relationship,
          member.firstName,
          member.lastName,
          member.dateOfBirth,
          member.zip,
          member.gender,
          member.tobacco ? 1 : 0,
          member.annualSalaryCents,
          member.email,
          member.waived ? 1 : 0,
          source,
          createdAt,
        ] as InValue[],
      })),
    ], "write");
    return this.listCensus(groupId);
  }

  async listCensus(groupId: string): Promise<CensusMember[]> {
    const rows = await this.many(
      "SELECT * FROM census_members WHERE group_id = ? ORDER BY subscriber_id, CASE relationship WHEN 'self' THEN 0 WHEN 'spouse' THEN 1 ELSE 2 END, date_of_birth",
      [groupId],
    );
    return rows.map(mapMember);
  }

  async saveFinchConnection(row: FinchConnectionRow): Promise<void> {
    await this.run(
      `INSERT INTO finch_connections
        (group_id, connection_id, provider_id, access_token_ciphertext, products_json, entity_id, company_json, last_synced_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(group_id) DO UPDATE SET
        connection_id = excluded.connection_id,
        provider_id = excluded.provider_id,
        access_token_ciphertext = excluded.access_token_ciphertext,
        products_json = excluded.products_json,
        entity_id = excluded.entity_id,
        company_json = excluded.company_json,
        last_synced_at = excluded.last_synced_at`,
      [row.groupId, row.connectionId, row.providerId, row.accessTokenCiphertext, JSON.stringify(row.products), row.entityId, row.companyJson, row.lastSyncedAt, row.createdAt],
    );
  }

  async getFinchConnection(groupId: string): Promise<FinchConnectionRow | null> {
    const row = await this.one("SELECT * FROM finch_connections WHERE group_id = ?", [groupId]);
    if (!row) return null;
    return {
      groupId: String(row.group_id),
      connectionId: nullableString(row.connection_id),
      providerId: nullableString(row.provider_id),
      accessTokenCiphertext: String(row.access_token_ciphertext),
      products: JSON.parse(String(row.products_json)) as string[],
      entityId: nullableString(row.entity_id),
      companyJson: nullableString(row.company_json),
      lastSyncedAt: nullableString(row.last_synced_at),
      createdAt: String(row.created_at),
    };
  }

  async markFinchSynced(groupId: string, syncedAt: string, companyJson: string | null): Promise<void> {
    await this.run(
      "UPDATE finch_connections SET last_synced_at = ?, company_json = COALESCE(?, company_json) WHERE group_id = ?",
      [syncedAt, companyJson, groupId],
    );
  }

  async saveBenefitSnapshot(id: string, groupId: string, syncedAt: string, payload: unknown): Promise<void> {
    await this.run(
      "INSERT INTO benefit_snapshots (id, group_id, synced_at, payload_json) VALUES (?, ?, ?, ?)",
      [id, groupId, syncedAt, JSON.stringify(payload)],
    );
  }

  async latestBenefits(groupId: string): Promise<unknown | null> {
    const row = await this.one(
      "SELECT payload_json FROM benefit_snapshots WHERE group_id = ? ORDER BY synced_at DESC LIMIT 1",
      [groupId],
    );
    return row ? JSON.parse(String(row.payload_json)) : null;
  }

  async replacePlans(plans: Plan[]): Promise<void> {
    await this.db.batch([
      "DELETE FROM plans",
      ...plans.map((plan) => ({
        sql: "INSERT INTO plans (id, line, payload_json, active) VALUES (?, ?, ?, 1)",
        args: [plan.id, plan.line, JSON.stringify(plan)] as InValue[],
      })),
    ], "write");
  }

  async upsertPlans(plans: Plan[]): Promise<void> {
    if (!plans.length) return;
    await this.db.batch(
      plans.map((plan) => ({
        sql: `INSERT INTO plans (id, line, payload_json, active) VALUES (?, ?, ?, 1)
              ON CONFLICT(id) DO UPDATE SET line = excluded.line, payload_json = excluded.payload_json, active = 1`,
        args: [plan.id, plan.line, JSON.stringify(plan)] as InValue[],
      })),
      "write",
    );
  }

  async listPlans(): Promise<Plan[]> {
    const rows = await this.many(
      `SELECT payload_json FROM plans WHERE active = 1
       ORDER BY CASE line WHEN 'medical' THEN 0 WHEN 'dental' THEN 1 ELSE 2 END, id`,
      [],
    );
    return rows.map((row) => JSON.parse(String(row.payload_json)) as Plan);
  }

  async replaceAreas(areas: AreaFactor[]): Promise<void> {
    await this.db.batch([
      "DELETE FROM area_factors",
      ...areas.map((area) => ({
        sql: "INSERT INTO area_factors (zip, state, rating_area, factor, source) VALUES (?, ?, ?, ?, ?)",
        args: [area.zip, area.state, area.ratingArea, area.factor, area.source] as InValue[],
      })),
    ], "write");
  }

  async upsertAreas(areas: AreaFactor[]): Promise<void> {
    if (!areas.length) return;
    await this.db.batch(
      areas.map((area) => ({
        sql: `INSERT INTO area_factors (zip, state, rating_area, factor, source) VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(zip) DO UPDATE SET state = excluded.state, rating_area = excluded.rating_area, factor = excluded.factor, source = excluded.source`,
        args: [area.zip, area.state, area.ratingArea, area.factor, area.source] as InValue[],
      })),
      "write",
    );
  }

  async listAreas(): Promise<AreaFactor[]> {
    const rows = await this.many("SELECT * FROM area_factors ORDER BY zip", []);
    return rows.map((row) => ({
      zip: String(row.zip),
      state: String(row.state),
      ratingArea: String(row.rating_area),
      factor: Number(row.factor),
      source: String(row.source) as AreaFactor["source"],
    }));
  }

  async findQuoteByIdempotency(userId: string, key: string): Promise<QuoteRow | null> {
    const row = await this.one("SELECT * FROM quotes WHERE created_by = ? AND idempotency_key = ?", [userId, key]);
    return row ? mapQuote(row) : null;
  }

  async createQuote(quote: QuoteRow): Promise<void> {
    await this.run(
      `INSERT INTO quotes
        (id, group_id, created_by, idempotency_key, effective_date, contribution_json, preferences_json, result_json, recommendation_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [quote.id, quote.groupId, quote.createdBy, quote.idempotencyKey, quote.effectiveDate, quote.contributionJson, quote.preferencesJson, quote.resultJson, quote.recommendationJson, quote.createdAt],
    );
  }

  async getQuote(id: string): Promise<QuoteRow | null> {
    const row = await this.one("SELECT * FROM quotes WHERE id = ?", [id]);
    return row ? mapQuote(row) : null;
  }

  async listQuotes(groupId: string): Promise<QuoteRow[]> {
    const rows = await this.many("SELECT * FROM quotes WHERE group_id = ? ORDER BY created_at DESC", [groupId]);
    return rows.map(mapQuote);
  }

  private async count(table: string): Promise<number> {
    const row = await this.one(`SELECT COUNT(*) AS c FROM ${table}`, []);
    return Number(row?.c ?? 0);
  }

  private async one(sql: string, args: InValue[]): Promise<SqlRow | null> {
    const result = await this.db.execute({ sql, args });
    return (result.rows[0] as SqlRow | undefined) ?? null;
  }

  private async many(sql: string, args: InValue[]): Promise<SqlRow[]> {
    const result = await this.db.execute({ sql, args });
    return result.rows as SqlRow[];
  }

  private async run(sql: string, args: InValue[]): Promise<void> {
    await this.db.execute({ sql, args });
  }
}

function mapUser(row: SqlRow): UserRow {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    passwordHash: String(row.password_hash),
    role: String(row.role) === "admin" ? "admin" : "broker",
    createdAt: String(row.created_at),
  };
}

function mapGroup(row: SqlRow): GroupRow {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    legalName: String(row.legal_name),
    dba: nullableString(row.dba),
    sic: nullableString(row.sic),
    state: String(row.state),
    zip: String(row.zip),
    effectiveDate: String(row.effective_date),
    finchCustomerId: String(row.finch_customer_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapMember(row: SqlRow): CensusMember {
  return {
    id: String(row.id),
    subscriberId: String(row.subscriber_id),
    relationship: String(row.relationship) as CensusMember["relationship"],
    firstName: String(row.first_name),
    lastName: String(row.last_name),
    dateOfBirth: String(row.date_of_birth),
    zip: String(row.zip),
    gender: String(row.gender) as CensusMember["gender"],
    tobacco: Number(row.tobacco) === 1,
    annualSalaryCents: row.annual_salary_cents === null ? null : Number(row.annual_salary_cents),
    email: nullableString(row.email),
    waived: Number(row.waived) === 1,
  };
}

function mapQuote(row: SqlRow): QuoteRow {
  return {
    id: String(row.id),
    groupId: String(row.group_id),
    createdBy: String(row.created_by),
    idempotencyKey: nullableString(row.idempotency_key),
    effectiveDate: String(row.effective_date),
    contributionJson: String(row.contribution_json),
    preferencesJson: String(row.preferences_json),
    resultJson: String(row.result_json),
    recommendationJson: String(row.recommendation_json),
    createdAt: String(row.created_at),
  };
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}
