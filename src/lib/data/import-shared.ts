import type { Db } from "@/lib/db";

/** A drizzle database or an open transaction (savepoints nest via `.transaction()`). */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

/** Thrown inside a transaction to roll it back on purpose (dry runs). */
export class DryRunRollback extends Error {
  constructor(public result: unknown) {
    super("dry run — rolled back");
  }
}

/**
 * Runs `fn` in a transaction; when `write` is false the transaction is rolled back after `fn`
 * completes, so a dry run exercises every statement without persisting anything.
 */
export async function inTransaction<T>(db: DbOrTx, write: boolean, fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await db.transaction(async (tx) => {
      const r = await fn(tx);
      if (!write) throw new DryRunRollback(r);
      return r;
    });
  } catch (e) {
    if (e instanceof DryRunRollback) return e.result as T;
    throw e;
  }
}

/** An error with an HTTP status, raised by import data functions (route handlers map it to HttpError). */
export class ImportError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
