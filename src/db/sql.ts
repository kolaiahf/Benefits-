import { createClient, type InValue } from "@libsql/client";
import pg from "pg";

export interface SqlStatement {
  sql: string;
  args?: unknown[];
}

export interface SqlResult {
  rows: Record<string, unknown>[];
  rowsAffected: number;
}

export interface SqlClient {
  execute(input: { sql: string; args: unknown[] }): Promise<SqlResult>;
  batch(statements: Array<string | SqlStatement>, mode?: "write"): Promise<void>;
  close(): Promise<void>;
}

export async function openDatabase(url: string): Promise<SqlClient> {
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) return openPostgres(url);
  return openLibsql(url);
}

function openLibsql(url: string): SqlClient {
  const db = createClient({ url });
  return {
    async execute(input) {
      const result = await db.execute({ sql: input.sql, args: input.args as InValue[] });
      return { rows: result.rows as Record<string, unknown>[], rowsAffected: result.rowsAffected };
    },
    async batch(statements) {
      await db.batch(statements.map(toLibsql), "write");
    },
    async close() {
      db.close();
    },
  };
}

const pools = new Map<string, pg.Pool>();

function openPostgres(url: string): SqlClient {
  const existing = pools.get(url);
  const pool = existing ?? new pg.Pool({
    connectionString: url,
    max: 1,
    ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
  });
  if (!existing) pools.set(url, pool);
  return {
    async execute(input) {
      const result = await pool.query(toPostgres(input.sql), input.args);
      return { rows: result.rows as Record<string, unknown>[], rowsAffected: result.rowCount ?? 0 };
    },
    async batch(statements) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const statement of statements) {
          const normalized = typeof statement === "string" ? { sql: statement, args: [] } : statement;
          await client.query(toPostgres(normalized.sql), normalized.args ?? []);
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      // The pool is reused across serverless invocations.
    },
  };
}

function toPostgres(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
}

function toLibsql(statement: string | SqlStatement): string | { sql: string; args: InValue[] } {
  if (typeof statement === "string") return statement;
  return { sql: statement.sql, args: (statement.args ?? []) as InValue[] };
}
