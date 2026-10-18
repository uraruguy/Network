# Contributing

Thanks for looking. The Network is a single-owner app: every change should keep it fast, private and
calm for the one person whose data is in it.

## Setup

Node 22 (`.nvmrc`), pnpm (`packageManager` in `package.json`; `corepack enable`), Docker and the
[Supabase CLI](https://supabase.com/docs/guides/local-development).

```bash
pnpm install
supabase start          # local Postgres + Auth; applies supabase/migrations
pnpm bootstrap          # .env.local + local owner account (safe to re-run)
pnpm db:seed-cities
pnpm dev                # http://localhost:3100
```

Optional: `pnpm exec tsx scripts/dev/seed-people.ts seed 600` for a full people list,
`scripts/dev/globe-seed.ts` for globe clusters (both local-only, both have a clean-up command).
`/dev/ui` shows every UI primitive (development builds only).

## Branches and pull requests

1. Branch from `main` (`feature/…`, `fix/…`).
2. Keep each PR to one concern and each commit to one logical step, with a message that says why.
3. Run the checks below before pushing. CI runs the same ones plus a job that applies every migration
   to a fresh Postgres.
4. Describe what changed, how you verified it (tests, the screens you clicked through, phone and
   desktop), and anything you couldn't verify.

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm lint:design --strict      # no raw font sizes, radii or hex colours in src/components
pnpm test
pnpm build
```

Database-level tests run against your local stack:
`TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm test`.

## Code style

- **Match the surrounding code.** Look at two neighbouring files before writing a new one: naming,
  file layout, how errors flow, how much is typed.
- **Comments explain why.** A doc block at the top of a module or above a non-obvious function; no
  comments that restate the code. Existing files are a good guide to the density.
- **Pure logic gets a unit test** next to it (`foo.ts` → `foo.test.ts`). Prefer small pure helpers
  that take their inputs (including `env`) as arguments.
- **Server data** goes in `src/lib/data/*`, takes `ownerId` first, and sets `ownerId` on every write.
  Route handlers use `withOwner`, `parseBody` and `parseQuery` from `src/lib/api-server.ts`.
- **Client data** goes through the hooks in `src/lib/queries/*`; writes use mutation defaults so they
  survive going offline.
- **UI** uses the primitives in `src/components/ui/*` and the design tokens in `src/app/globals.css`;
  never native `confirm()`, `<select>` or date inputs. Check a phone width and a desktop width, light
  and dark.
- New environment variables go into `src/lib/env.ts` (if the app reads them) and `.env.example`.
- New AI capabilities go into the tool registry (`src/lib/ai/tools`) so chat and MCP get them
  together; update `docs/mcp.md`.

[CLAUDE.md](CLAUDE.md) has the full list of conventions (it is what AI coding agents read too).

## Migrations

- Plain SQL in `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`. Generate the DDL with
  `pnpm db:generate` if you changed `src/lib/db/schema.ts`, then write the migration by hand around it.
- **Additive only, and never edit a migration that has been applied anywhere.** Fix forward with a new
  file.
- New tables: `owner_id` referencing `auth.users`, RLS enabled with an owner policy, and
  `revoke all on <table> from anon, authenticated` (the Data API stays closed).
- Bump `LATEST_KNOWN_MIGRATION` in `src/lib/connections/setup-status.ts`.
- Test with `supabase db reset` (re-applies every migration; it also wipes local data, so run
  `pnpm bootstrap` and `pnpm db:seed-cities` again) and the database tests.

## Security

Please report vulnerabilities privately as described in [SECURITY.md](SECURITY.md), not in issues or
pull requests. Never commit secrets or real personal data: fixtures are synthetic, `.env*` files are
gitignored (except `.env.example`), and the import pipeline writes its artifacts to the gitignored
`.cache/`.

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
