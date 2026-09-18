@AGENTS.md

# The Network

Personal relationship manager for one user (Jakob). People-centric notes, 3D globe of connections, categories + warmth, email follow-up reminders, AI chat over the whole database, Apple Notes import. Installable PWA for iPhone + Mac.

## Stack
Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind v4 · Motion · Supabase (Postgres + Auth) · Drizzle ORM · TanStack Query (offline persist) · react-globe.gl · Tiptap v3 · Vercel AI SDK + OpenRouter · Resend · Serwist PWA.

## Commands
- `pnpm dev` — dev server on http://localhost:3100 (+ service-worker watcher)
- `pnpm build` — production build + SW
- `pnpm typecheck` / `pnpm lint` / `pnpm test`
- `pnpm db:generate` — drizzle-kit DDL diff (paste into a new `supabase/migrations/*.sql` and add RLS)
- `supabase db push` — apply migrations to the linked project
- `pnpm db:seed-cities` — load GeoNames cities into `cities`
- `pnpm notes:export` — export Apple Notes to JSON for import

## Conventions
- Node 22 (`.nvmrc`), pnpm. Read `node_modules/next/dist/docs/` before using unfamiliar Next APIs.
- All server-side writes MUST set `ownerId` explicitly (the DB default `auth.uid()` is null over the service-role connection).
- Data access lives in `src/lib/data/*` (server) and is exposed via route handlers / server actions; client uses TanStack Query hooks in `src/lib/queries/*`.
- Design tokens in `src/app/globals.css`. Use `glass`, `glass-strong`, `specular`, `pressable` utilities; radii via `rounded-[var(--r-*)]`; accent via Tailwind `accent*` colors. Turquoise + white, Apple-like, minimal.
- Mobile first: phone tab bar `<lg`, sidebar `≥lg`. Respect safe-area insets.
- Migrations are plain SQL in `supabase/migrations`. Never edit an applied migration.
- Secrets only in `.env.local` / Vercel env. Never commit them.
