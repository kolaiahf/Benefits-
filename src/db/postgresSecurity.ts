import type { SqlClient } from "./sql.js";

/** Tables that hold employer census, quotes, and payroll tokens. */
export const PROTECTED_TABLES = [
  "users",
  "sessions",
  "api_keys",
  "groups",
  "census_members",
  "finch_connections",
  "benefit_snapshots",
  "plans",
  "rating_regions",
  "area_factors",
  "quotes",
  "agencies",
  "harbor_quotes",
] as const;

/**
 * The app connects as the database owner, which bypasses row level security.
 * Enabling it with no policies keeps the Supabase anon and authenticated API roles
 * from reading census rows or Finch tokens through PostgREST.
 */
export async function hardenPostgres(db: SqlClient): Promise<void> {
  const roles = await db.execute({
    sql: "SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')",
    args: [],
  });
  const present = roles.rows
    .map((row) => String(row.rolname))
    .filter((role) => role === "anon" || role === "authenticated");
  for (const table of PROTECTED_TABLES) {
    const name = ident(table);
    await db.execute({ sql: `ALTER TABLE ${name} ENABLE ROW LEVEL SECURITY`, args: [] });
    await db.execute({ sql: `REVOKE ALL ON TABLE ${name} FROM PUBLIC`, args: [] });
    for (const role of present) {
      await db.execute({ sql: `REVOKE ALL ON TABLE ${name} FROM ${ident(role)}`, args: [] });
    }
  }
  if (!present.includes("authenticated")) return;
  const authSchema = await db.execute({ sql: "SELECT 1 AS ok FROM pg_namespace WHERE nspname = 'auth'", args: [] });
  if (!authSchema.rows.length) return;
  await db.execute({ sql: "CREATE SCHEMA IF NOT EXISTS harbor_private", args: [] });
  await db.execute({
    sql: `CREATE OR REPLACE FUNCTION harbor_private.current_agency_id()
      RETURNS text
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $$ SELECT agency_id FROM public.users WHERE id = auth.uid()::text $$`,
    args: [],
  });
  await db.execute({ sql: "REVOKE ALL ON FUNCTION harbor_private.current_agency_id() FROM PUBLIC", args: [] });
  await db.execute({ sql: "GRANT USAGE ON SCHEMA harbor_private TO authenticated", args: [] });
  await db.execute({ sql: "GRANT EXECUTE ON FUNCTION harbor_private.current_agency_id() TO authenticated", args: [] });
  await db.execute({ sql: "DROP POLICY IF EXISTS harbor_quotes_agency ON harbor_quotes", args: [] });
  await db.execute({
    sql: `CREATE POLICY harbor_quotes_agency ON harbor_quotes
      FOR ALL TO authenticated
      USING (agency_id IS NOT NULL AND agency_id = harbor_private.current_agency_id())
      WITH CHECK (agency_id IS NOT NULL AND agency_id = harbor_private.current_agency_id())`,
    args: [],
  });
  await db.execute({ sql: "DROP POLICY IF EXISTS agencies_member ON agencies", args: [] });
  await db.execute({
    sql: `CREATE POLICY agencies_member ON agencies
      FOR SELECT TO authenticated
      USING (id = harbor_private.current_agency_id())`,
    args: [],
  });
}

function ident(value: string): string {
  if (!/^[a-z_]+$/.test(value)) throw new Error(`Unexpected SQL identifier: ${value}`);
  return value;
}
