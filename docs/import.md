# Importing Apple Notes

The Network can read years of Apple Notes and turn them into people: who each note is about, how you
met, where they live, what they do, open follow-ups. Claude does the reading and the entity
resolution ("Blaž", "Blažem" and "Blaž Novak" are one person); you confirm the unsure cases; nothing
lands in your network until you commit, and every commit can be undone.

There are two ways in:

| | When | Where the AI runs |
| --- | --- | --- |
| **Paste a note** (Import → Paste a note) | one note, an e-mail, a call transcript | the AI connection from Settings → AI & e-mail |
| **Inbox** (the iPhone Shortcut, or Capture on Today) | a quick capture, applied after triage | the AI connection from Settings → AI & e-mail |
| **Apple Notes pipeline** (this page) | your whole Notes library, re-run whenever you like | your Mac, through the CLI in `scripts/import` |

Pastes and inbox captures are saved through the same commit as the pipeline (one transaction,
logged, undoable); applying a capture twice returns the first result instead of failing.

The pipeline's AI stages default to your **Claude subscription** via the Claude Agent SDK
(`agent-sdk`: run `claude` once and `/login`), so a library of thousands of notes costs nothing extra.
Paid API keys work too but need an explicit `--allow-paid`.

## Safety rails (every `scripts/import/*` command)

| Flag | Meaning |
| --- | --- |
| *(none)* | **Dry run.** Write-capable commands print what they would do; `commit` runs inside a transaction that is rolled back. |
| `--write` | Actually write. |
| `--env <file>` | Env file layered over `.env.local` (default `.env.local`). Use `--env .env.cloud.local` to target your cloud project. |
| `--yes-prod` | Required whenever `DATABASE_URL` is not `localhost`/`127.0.0.1`; without it the command exits with code 3. |
| `--run <id>` | Run id; artifacts go to `.cache/import/<id>/` in the main checkout (default: today's date). |
| `--owner <email>` | Owner profile (default: the only profile). |
| `--provider agent-sdk\|anthropic\|openrouter` | AI stages only. Paid providers also need `--allow-paid`. |

`--write` and `--yes-prod` are independent on purpose: a write against production needs both.
Rehearse on a local copy first (see [Rehearsal](#rehearsal-on-a-local-copy)).

## 1. Export

On the Mac that has Notes, in Terminal (macOS asks once to let Terminal control Notes):

```bash
pnpm notes:export --clean      # → .cache/notes-export.json and .cache/notes-export.clean.json
```

`--clean` (or `pnpm notes:clean` afterwards) strips inline images, which can shrink the export from
hundreds of MB to a few. `pnpm notes:export "Folder"` exports one folder.

## 2. Ingest

```bash
pnpm import:backup --env .env.cloud.local --yes-prod                      # JSON backup first (read-only)
pnpm import:diff .cache/notes-export.clean.json --env .env.cloud.local --yes-prod   # optional, read-only: what changed
pnpm import:ingest .cache/notes-export.clean.json --env .env.cloud.local --yes-prod --write
```

Ingest stores each note verbatim in `import_items`. It is incremental: new notes are queued, changed
ones re-queued (people whose notes changed go back to review), deleted ones remembered. Instead of
the CLI you can drop `notes-export.json` on **Import → Apple Notes** in the app; it runs the same code.

## 3. Screen and extract (AI)

```bash
pnpm import:screen  --env .env.cloud.local --yes-prod --write   # which notes are about people
pnpm import:extract --env .env.cloud.local --yes-prod --write   # people, places, dates, follow-ups per note
```

Both are resumable: work is picked by status, and a usage limit stops the run cleanly (exit 2): run it
again later. `--retry-failed` requeues failures, `--limit` caps a run, `--model`/`--fast-model` pick
models (default Opus / Sonnet on the subscription).

**No SDK at all?** `--emit` writes the pending work as batch files plus a `BRIEF-<stage>.md` for Claude
Code subagents; each subagent writes its output file, `pnpm tsx scripts/import/check-stage-output.ts`
checks it offline, and `--from <file> --write` applies it.

## 4. Resolve people (Claude subagents)

```bash
pnpm import:prepare --run 2026-10-18 --env .env.cloud.local --yes-prod
```

`prepare` (read-only on the database) groups every mention into clusters and writes a workspace under
`.cache/import/<run>/`: `packets/rNN.json`, the full notes as evidence, `index.md`, and
`BRIEF-resolve.md` (rendered from `src/lib/ai/prompts/resolve.ts`). Hand the brief to Claude Code and
let it fan out one subagent per packet; each writes `resolutions/rNN.json`. Then:

```bash
pnpm import:validate  --run 2026-10-18 --stage resolve resolutions/r01.json resolutions/r02.json … --env .env.cloud.local --yes-prod
pnpm import:apply     --run 2026-10-18 --stage resolve --env .env.cloud.local --yes-prod --write
pnpm import:reconcile --run 2026-10-18 --env .env.cloud.local --yes-prod --write
pnpm import:file      --run 2026-10-18 --env .env.cloud.local --yes-prod --write
```

`validate` resolves file names inside the run directory and exits 1 on any error. `apply` (all files in
`resolutions/` when none are named) never overwrites a proposal you already decided. `reconcile` merges duplicates across packets
and re-runs the auto-decision policy (clear cases are approved for you). `file` decides which person
each note is filed under; notes the rules can't place get filing packets and a `BRIEF-filing.md` for
the same subagent loop (`validate`/`apply --stage filing`).

## 5. Review

Open **Import → Apple Notes** in the app: one card per person, decided once (approve, reject as a
passer-by, merge into someone who exists). Keyboard on the Mac, swipes on the iPhone. The evidence
panel shows the exact lines each fact came from. The terminal equivalent is
`pnpm import:review` (`--approve`, `--reject`, `--merge … --into …`, `--undo`; dry run without `--write`).

## 6. Commit, verify, undo

Commit from the review screen, or:

```bash
pnpm import:commit    --run 2026-10-18 --env .env.cloud.local --yes-prod           # dry run: counts only
pnpm import:commit    --run 2026-10-18 --env .env.cloud.local --yes-prod --write
pnpm import:verify    --run 2026-10-18 --env .env.cloud.local --yes-prod           # exit 1 on any problem
pnpm import:spotcheck --run 2026-10-18 --env .env.cloud.local --yes-prod           # sampled report for a human
```

A commit only fills blanks on people who already exist, keeps every note verbatim under its person,
adds one pinned key-facts note and at most one imported follow-up per person (also when two
proposals end up as the same person), and logs every row it touches in `import_commit_log`.
Re-running it is safe, and it never undoes what you did in the app since:

- a note (or excerpt, or key-facts note) you **deleted** stays deleted;
- a note you **edited** in The Network keeps your version, even when the Apple note changed (new key
  facts for a facts note you edited are reported as warnings instead of merged);
- a person you **deleted** is skipped, not recreated (the commit panel and `commit` list them);
- merging a proposal into someone already committed sends their facts to that person next commit.

The ≤3-reminders-per-day spread and introductions (“introduced by”) work across commits, so the
app's chunked commit (20 people at a time) and resumed CLI runs give the same result as one run.

**Rollback** (exact, in reverse order, one transaction):

```bash
pnpm import:rollback --list --env .env.cloud.local --yes-prod
pnpm import:rollback --commit <commitId> --env .env.cloud.local --yes-prod --write
pnpm import:rollback --all --source apple-notes --env .env.cloud.local --yes-prod --write
```

It refuses to delete an imported person you have since built on — notes, follow-ups, tags,
categories, activities, mentions in your own notes, people they introduced, chat threads — unless
`--force`. Places, tags and activities the commit created are kept while anything else still uses
them. Fields the commit filled go back to their previous value even if you changed them since
(the log stores only the previous values). The app's commit panel has the same undo.

## Duplicates the import missed

When two cards turn out to be one person, open either and choose **More → Merge with…** (People
also lists same-name cards under *Possible duplicates*). Pick the card to keep and the sheet previews
what moves onto it: notes, follow-ups, mentions, introductions, chats, categories, tags and
activities; blank fields are filled from the other card, two imported key-facts notes become one, and
import proposals point at the kept person, so the next commit fills it instead of recreating the
duplicate. The other card is soft-deleted. It needs a connection and can't be undone from the app.
The terminal equivalent is `pnpm tsx scripts/import/merge-people.ts --from <duplicate> --into <kept>`
(dry run without `--write`); both are logged as `person.merge` in the audit log.

## Rehearsal on a local copy

```bash
pnpm import:backup --env .env.cloud.local --yes-prod                         # → .cache/backups/<iso>/
pnpm tsx scripts/import/restore-backup.ts .cache/backups/<iso> --target local --write
```

`restore-backup` only ever writes to the local database (it replaces the local owner's rows). Run the
whole pipeline locally without `--env`/`--yes-prod`, check the result in `pnpm dev`, then repeat against
production. `pnpm tsx scripts/import/seed-fixture.ts --write` seeds 30 synthetic notes to practise
resolve → commit → rollback without any AI.

## Legacy one-shot importer

`pnpm notes:import` / `pnpm notes:resume` (`scripts/import-cli.ts`) classify and extract in one pass
into the v1 import jobs, against `.env.cloud.local`. The pipeline above replaces it; it is kept for
old jobs.
