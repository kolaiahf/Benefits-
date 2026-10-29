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
}

function ident(value: string): string {
  if (!/^[a-z_]+$/.test(value)) throw new Error(`Unexpected SQL identifier: ${value}`);
  return value;
}
