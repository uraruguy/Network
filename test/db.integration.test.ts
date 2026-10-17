/**
 * Database-level checks for the v2 migrations, against a LOCAL Supabase database.
 * Opt-in: TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm test
 * Everything runs inside a transaction that is rolled back.
 */
import postgres from "postgres";
import { describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const local = !!url && /@(127\.0\.0\.1|localhost)[:/]/.test(url);

describe.skipIf(!local)("v2 migrations (local database)", () => {
  const withRollback = async (fn: (sql: postgres.TransactionSql) => Promise<void>) => {
    const sql = postgres(url!, { max: 1 });
    try {
      await sql
        .begin(async (tx) => {
          await fn(tx);
          throw new Error("rollback");
        })
        .catch((e) => {
          if (e.message !== "rollback") throw e;
        });
    } finally {
      await sql.end();
    }
  };

  it("keeps people.next_followup_at in sync with open reminders", () =>
    withRollback(async (tx) => {
      const [owner] = await tx`select id from profiles limit 1`;
      if (!owner) return;
      const [p] = await tx`insert into people (owner_id, display_name) values (${owner.id}, 'Trigger test') returning id`;
      const soon = new Date(Date.now() + 86_400_000);
      const later = new Date(Date.now() + 5 * 86_400_000);
      const [r1] = await tx`insert into reminders (owner_id, person_id, due_at) values (${owner.id}, ${p!.id}, ${later}) returning id`;
      await tx`insert into reminders (owner_id, person_id, due_at) values (${owner.id}, ${p!.id}, ${soon})`;
      let [row] = await tx`select next_followup_at from people where id = ${p!.id}`;
      expect(new Date(row!.next_followup_at).getTime()).toBe(soon.getTime());
      await tx`update reminders set status = 'done' where person_id = ${p!.id} and id <> ${r1!.id}`;
      [row] = await tx`select next_followup_at from people where id = ${p!.id}`;
      expect(new Date(row!.next_followup_at).getTime()).toBe(later.getTime());
      await tx`delete from reminders where id = ${r1!.id}`;
      [row] = await tx`select next_followup_at from people where id = ${p!.id}`;
      expect(row!.next_followup_at).toBeNull();
    }));

  it("searches accent-insensitively with the network text search config", () =>
    withRollback(async (tx) => {
      const [hit] = await tx`select to_tsvector('public.network', 'Čevapi v Ljubljani') @@ to_tsquery('public.network', 'cevap:* & ljubljan:*') as ok`;
      expect(hit!.ok).toBe(true);
      const [slug] = await tx`select private.slugify('Čaj s prijatelji') as s`;
      expect(slug!.s).toBe("caj-s-prijatelji");
    }));

  it("enforces case-insensitive tag names", () =>
    withRollback(async (tx) => {
      const [owner] = await tx`select id from profiles limit 1`;
      if (!owner) return;
      await tx`insert into tags (owner_id, name) values (${owner.id}, 'Integration Tag')`;
      await expect(tx`insert into tags (owner_id, name) values (${owner.id}, 'integration tag')`).rejects.toThrow(/tags_owner_lower_name_uidx/);
    }));
});
