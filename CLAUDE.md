@AGENTS.md

# The Network

Personal relationship manager for one owner. People-centric notes, MapLibre globe + introducer graph, categories/warmth/tags/activities, e-mail follow-up digest, AI chat and an MCP server over the same tool registry, Apple Notes import with Claude-assisted entity resolution, passkey 2FA. Installable offline PWA (iPhone + Mac). Public docs: README.md, SECURITY.md, docs/mcp.md, docs/import.md.

## Stack
Next.js 16 (App Router, Turbopack, `src/proxy.ts` instead of middleware) · React 19 · TypeScript · Tailwind v4 · Base UI · Motion · Supabase (Postgres + Auth) · Drizzle ORM · TanStack Query (IndexedDB persist) · MapLibre GL · Tiptap 3 · Vercel AI SDK (Anthropic / OpenRouter / Claude Agent SDK) · MCP SDK · SimpleWebAuthn · Resend/Nodemailer · Serwist.

## Commands
- `pnpm dev` — http://localhost:3100 (+ service-worker watcher). Use localhost, not 127.0.0.1 (passkey RP id).
- `supabase start` then `pnpm bootstrap` — local stack + `.env.local` (never overwrites values) + local owner account. `pnpm db:seed-cities` once per database.
- `pnpm typecheck` (runs `next typegen` first) · `pnpm lint` · `pnpm lint:design --strict` · `pnpm test` · `pnpm build` — all run in CI (`.github/workflows/ci.yml`).
- `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm test` — adds the local DB tests.
- `pnpm db:generate` — Drizzle DDL diff; paste into a NEW `supabase/migrations/<timestamp>_<name>.sql` and add RLS + grant revokes.
- `pnpm import:*` — Apple Notes pipeline (docs/import.md). `pnpm tsx scripts/db/readonly-query.ts "select …"` — read-only SQL.

## Conventions
- Node 22 (`.nvmrc`), pnpm (`packageManager`). Read `node_modules/next/dist/docs/` before using unfamiliar Next APIs.
- Match the surrounding code: dense, typed, small pure helpers with unit tests next to them (`*.test.ts`). Comments explain why, as file/function doc blocks; no narration.

### Data & auth
- Server data access lives in `src/lib/data/*`; every function takes `ownerId` first and filters on it. All writes MUST set `ownerId` explicitly (Drizzle connects as `postgres`, bypassing RLS; the `auth.uid()` default is null there).
- Route handlers wrap in `withOwner` (`src/lib/api-server.ts`): re-verifies the JWT locally (`getClaims`) + passkey cookie, validates params/body (zod via `parseBody`/`parseQuery`), returns `{ error, message }` and `Cache-Control: private, no-store`. Server components use `getOwner()` (`src/lib/auth/server.ts`).
- Passkey is required by default (`AUTH_REQUIRE_PASSKEY=false` only locally). Route classes in `src/lib/auth/routes.ts`; new routes are protected by default. Machine endpoints authenticate themselves (bearer + `safeEqual`).
- `APP_SECRET` derives every key via HKDF (`src/lib/crypto/keys.ts`); verification also accepts `APP_SECRET_PREVIOUS`. Connection secrets are encrypted (`src/lib/crypto/secrets.ts`).
- Env is validated in `src/lib/env.ts`; document every new variable in `.env.example`. Secrets only in `.env.local` / Vercel env.
- Migrations: plain SQL, additive, idempotent where possible (`if not exists`), RLS on + `revoke all … from anon, authenticated` for new tables (the Data API stays closed). Never edit an applied migration. Bump `LATEST_KNOWN_MIGRATION` in `src/lib/connections/setup-status.ts`.

### Client data & offline
- Hooks in `src/lib/queries/*`, keys from `queries/keys.ts`. Every query persists to IndexedDB unless `meta: { persist: false }` (large, volatile or sensitive: chat, search, geocoding).
- Writes go through `qc.setMutationDefaults` (registered in `src/components/providers.tsx` before restore), so paused offline mutations resume after reload. Serialize per entity with `scope: { id: "person:<id>" }` / `"note:<id>"`; patch caches optimistically.
- Bump `CACHE_VERSION` (`src/lib/offline/queryClient.ts`) when a cached API shape changes incompatibly.

### Design system
- Primitives in `src/components/ui/*` (Base UI): Sheet, Dialog, Menu, ContextMenu, Select, Combobox, `date/DateField`, SegmentedControl, Toast (`toast()`), `confirm()`. Never native `confirm()`/`alert()`, `<select>`, or `<input type="date">`. Gallery at `/dev/ui` (dev only).
- Tokens in `src/app/globals.css`. HIG type classes (`text-large-title … text-caption2`), radius tokens (`rounded-xs … rounded-xl`), colour tokens (`bg-accent`, `text-fg-2`, `var(--palette-*)`). No raw px font sizes, radii or hex in components: `pnpm lint:design` (allow a deliberate exception with a `design-ignore` comment).
- Materials: `surface` (cards, lists, inputs; no blur), `glass` (floating chrome), `glass-thick` (popovers, sheets, menus), `glass-map` (over the globe/graph); plus `specular`, `pressable`, `elevation-*`, `safe-*`, `hit-44`. Turquoise + white, Apple-like, minimal.
- Mobile first: tab bar `<lg`, sidebar `≥lg`, safe-area insets, 44pt hit targets.

### AI, MCP, import
- One tool registry for chat and MCP: `src/lib/ai/tools` (`defineOp` in `read.ts`/`write.ts`, `runOp` enforces scopes, rate limits and audit). No delete tools. MCP server/auth in `src/lib/mcp`, docs in `docs/mcp.md` (keep the tool tables in sync).
- AI config: env first, then Settings → AI & e-mail (`src/lib/connections`). Prompts in `src/lib/ai/prompts`.
- Import scripts (`scripts/import/*`) are dry runs without `--write` and refuse a non-local `DATABASE_URL` without `--yes-prod`. Paid AI providers need `--allow-paid` (default `agent-sdk`). Never run `--write --yes-prod`, `review.ts` decisions or `rollback` without Jakob's explicit instruction.
- Production is off-limits unless Jakob asks: no `.env.cloud.local`, `supabase db push`/`link`/`config push`, or deploys.
