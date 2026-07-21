// Dedicated pg pool for writing Asterisk's realtime PJSIP tables (schema "asterisk"), separate
// from the Prisma client that owns schema "public". Asterisk reads these rows live via ODBC.
import { Pool } from "pg";
import { ASTERISK_DB_SCHEMA } from "@/lib/env";

let pool: Pool | null = null;

export function asteriskPool(): Pool {
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  return pool;
}

/** Schema-qualified, quoted table name for Asterisk realtime writes. */
export function T(table: string): string {
  return `"${ASTERISK_DB_SCHEMA}"."${table}"`;
}
