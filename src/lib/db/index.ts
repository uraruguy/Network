import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { serverEnv } from "@/lib/env";

declare global {
  var __networkSql: ReturnType<typeof postgres> | undefined;
}

/**
 * Server-only Drizzle client over the Supabase Postgres pooler.
 * Uses the service role connection string; authorization is enforced in
 * application code (single owner) — RLS still protects direct PostgREST access.
 */
function makeSql() {
  return postgres(serverEnv().DATABASE_URL, { prepare: false, max: 5, idle_timeout: 20 });
}

const sql = globalThis.__networkSql ?? makeSql();
if (process.env.NODE_ENV !== "production") globalThis.__networkSql = sql;

export const db = drizzle(sql, { schema });
export type Db = typeof db;
export { schema };
