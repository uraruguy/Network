import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { serverEnv } from "@/lib/env";

declare global {
  var __networkSql: ReturnType<typeof postgres> | undefined;
}

/**
 * Server-only Drizzle client over the Supabase Postgres pooler (transaction mode, hence no
 * prepared statements). The connection bypasses RLS, so authorization lives in application code:
 * every query filters on — and every insert sets — `ownerId` explicitly.
 */
function makeSql() {
  return postgres(serverEnv().DATABASE_URL, {
    prepare: false,
    max: 10,
    idle_timeout: 20,
    max_lifetime: 60 * 5,
    connect_timeout: 10,
  });
}

const sql = globalThis.__networkSql ?? makeSql();
if (process.env.NODE_ENV !== "production") globalThis.__networkSql = sql;

export const db = drizzle(sql, { schema });
export type Db = typeof db;
/** A transaction handle (same API as `db`). */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };
