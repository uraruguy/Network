# The Network

Your people, on a globe. A personal relationship manager for one person: notes per person, a 3D globe of where your connections live, an Obsidian-style graph of who introduced you to whom, follow-up reminders by email, and an AI chat that knows your whole network. Installable on iPhone and Mac as a home-screen app.

## Stack
Next.js 16 · TypeScript · Tailwind v4 · Motion · Supabase (Postgres + Auth) · Drizzle · TanStack Query (offline) · react-globe.gl · react-force-graph · Tiptap · Vercel AI SDK + OpenRouter (Claude) · Resend · Serwist PWA.

## Local development
```bash
nvm use            # Node 22
pnpm install
supabase start     # local Postgres + Auth in Docker (applies supabase/migrations)
cp .env.example .env.local   # fill in — for local, see the keys printed by `supabase start`
pnpm db:seed-cities          # GeoNames cities (34k, with time zones)
pnpm tsx scripts/seed-dev-user.ts   # local owner account dev@local.test / network-dev-2026
pnpm dev                     # http://localhost:3100
```

## Deploy (Vercel + Supabase cloud)
1. `supabase link --project-ref <ref>` then `supabase db push`, then `pnpm db:seed-cities` with `DATABASE_URL` pointing at the cloud DB.
2. In the Supabase dashboard → Authentication → URL configuration: Site URL = your Vercel URL; add `<url>/auth/callback` to redirect URLs.
3. `vercel` → set env vars from `.env.example` (`CRON_SECRET`/`INBOX_TOKEN`: `openssl rand -hex 24`).
4. Schedule the hourly digest from Postgres: `select set_digest_target('https://<your-app>.vercel.app', '<CRON_SECRET>');` (uses pg_cron + pg_net). `vercel.json` also has a daily fallback.
5. Sign up once with your email — the first account claims the instance; further sign-ups are rejected.

## Local Mac against the cloud database (recommended for the Apple Notes import)
`.env.cloud.local` holds the production Supabase keys plus `AI_PROVIDER=agent-sdk` (your Claude subscription via the Claude Agent SDK — run `claude` once in Terminal and `/login`). Then:
```bash
pnpm dev:cloud     # http://localhost:3100, writes straight into the cloud DB your phone uses
```
Heavy AI work (importing hundreds of notes with Opus) runs on your subscription here; the deployed app uses an API key for the small, frequent calls.

## Install on iPhone / Mac
- iPhone: open the URL in Safari → Share → **Add to Home Screen**. Works offline, full screen.
- Mac: Safari → File → **Add to Dock**.

## Import your Apple Notes
```bash
pnpm notes:export            # exports every note to .cache/notes-export.json (allow Terminal → Notes)
```
Then Settings → Import → drop the file. Claude classifies each note (person / meeting / list / not about people), extracts people with how-you-met, city, categories, hobbies, follow-ups, and you approve or merge each one. Originals are preserved verbatim as the first note.

## "Send to The Network" iPhone Shortcut
Create a Shortcut with these actions and enable **Show in Share Sheet** (accepts Text):
1. **Get Contents of URL** — `https://<your-app>.vercel.app/api/inbox`, Method **POST**, Headers: `Authorization: Bearer <INBOX_TOKEN>`, Request Body **JSON**: `text` = *Shortcut Input*, `source` = `shortcut`.
2. **Show Notification** — "Saved to The Network".
Share any text (a note, a message, a LinkedIn profile) and it lands in your Inbox on Today for AI triage. You can also add it to Siri: "Hey Siri, send to The Network".

## Data ownership
Settings → Export downloads everything as JSON. The database is plain Postgres with SQL migrations in `supabase/migrations`.
