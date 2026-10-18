"use client";
import { Check } from "lucide-react";
import { useCallback, useState } from "react";
import { Avatar } from "@/components/glass/Avatar";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput, GlassTextarea } from "@/components/glass/GlassInput";
import { Combobox } from "@/components/ui/Combobox";
import { Dialog, DialogClose } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import type { CATEGORY_SLUGS, ProfileProposal } from "@/lib/import/contracts";
import { searchMergeTargets, useProposalDetail, type MergeTarget, type Proposal } from "@/lib/queries/import-review";
import { cn, formatDate } from "@/lib/utils";
import { CategoryChips, Highlighted, Kbd } from "./parts";
import { avatarName, focusSnippet, plural } from "./text";

/** Runs `reset` when `open` turns true (state adjusted during render, so the first open frame is already fresh). */
function useResetOnOpen(open: boolean, key: unknown, reset: () => void) {
  const [seen, setSeen] = useState<{ open: boolean; key: unknown }>({ open, key });
  if (seen.open !== open || seen.key !== key) {
    setSeen({ open, key });
    if (open) reset();
  }
}

/* ------------------------------------------------------------------ */
/*  Merge                                                              */
/* ------------------------------------------------------------------ */

/** M: pick an existing person or another proposal (name + alias search) to merge this one into. */
export function MergeDialog({ open, onOpenChange, source, proposal, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; source: string; proposal: Proposal | null; onPick: (t: MergeTarget) => void }) {
  const [value, setValue] = useState<MergeTarget | null>(null);
  const first = proposal?.displayName.split(/\s+/)[0] ?? "";
  const search = useCallback((q: string) => searchMergeTargets(source, q || first, proposal?.id), [source, first, proposal?.id]);
  useResetOnOpen(open, proposal?.id, () => setValue(null));
  if (!proposal) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      width={480}
      title={`Merge ${proposal.displayName} into…`}
      description="Their notes, aliases and facts move to the person you pick."
      actions={
        <>
          <DialogClose render={<GlassButton variant="ghost" />}>Cancel</DialogClose>
          <GlassButton variant="primary" disabled={!value} onClick={() => value && onPick(value)}>
            Merge
          </GlassButton>
        </>
      }
    >
      <Combobox<MergeTarget>
        autoFocus
        value={value}
        onChange={(t) => {
          setValue(t);
          if (t) onPick(t);
        }}
        search={search}
        debounceMs={120}
        getKey={(t) => `${t.kind}:${t.id}`}
        getLabel={(t) => t.displayName}
        placeholder="Search people and proposals"
        aria-label="Merge into"
        emptyText="Nobody matches"
        renderItem={(t) => (
          <span className="flex items-center gap-2.5">
            <Avatar name={avatarName(t.displayName)} size={28} />
            <span className="min-w-0">
              <span className="block truncate">{t.displayName}</span>
              <span className="block truncate text-footnote text-fg-3">
                {[t.kind === "person" ? "In The Network" : t.status === "approved" ? "Approved proposal" : t.status === "committed" ? "Imported" : "Proposal", t.detail, t.aliases.length ? `aka ${t.aliases.slice(0, 2).join(", ")}` : null, t.mentions ? plural(t.mentions, "note") : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
          </span>
        )}
      />
      <p className="mt-3 text-footnote text-fg-3">
        Tip: pick the person and press <Kbd>↵</Kbd> to merge right away.
      </p>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Split                                                              */
/* ------------------------------------------------------------------ */

/** S: tick the mentions that belong to someone else → they become a new (approved) proposal. */
export function SplitDialog({ open, onOpenChange, proposal, onSplit }: { open: boolean; onOpenChange: (o: boolean) => void; proposal: Proposal | null; onSplit: (mentionIds: string[], displayName: string) => Promise<unknown> | void }) {
  const detail = useProposalDetail(proposal?.id ?? null, { enabled: open });
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useResetOnOpen(open, proposal?.id, () => {
    setPicked([]);
    setName("");
    setError(null);
  });
  if (!proposal) return null;
  const terms = [proposal.displayName, ...proposal.aliases];
  const rows = detail.data?.evidence ?? [];
  const all = rows.length > 0 && picked.length === rows.length;

  const submit = async () => {
    if (!picked.length) return setError("Tick the notes that are about someone else");
    if (all) return setError("Leave at least one note with " + proposal.displayName);
    if (!name.trim()) return setError("Give the other person a name");
    setBusy(true);
    try {
      await onSplit(picked, name.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      width={560}
      title={`Split ${proposal.displayName}`}
      description="Tick the notes about a different person. They become a new person you can approve."
      actions={
        <>
          <DialogClose render={<GlassButton variant="ghost" />}>Cancel</DialogClose>
          <GlassButton variant="primary" loading={busy} onClick={submit}>
            Split off {picked.length ? plural(picked.length, "note") : "notes"}
          </GlassButton>
        </>
      }
    >
      <form
        noValidate
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="max-h-[40dvh] space-y-1.5 overflow-y-auto pr-1">
          {detail.isLoading ? (
            <SkeletonRows count={3} avatar={false} />
          ) : (
            rows.map((e) => {
              const on = picked.includes(e.mentionId);
              return (
                <label
                  key={e.mentionId}
                  className={cn("flex cursor-pointer items-start gap-3 rounded-md px-3 py-2.5 transition-colors", on ? "bg-accent-soft" : "bg-fill-1 hover:bg-fill-2")}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => setPicked((xs) => (on ? xs.filter((x) => x !== e.mentionId) : [...xs, e.mentionId]))}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)]",
                      on ? "border-accent bg-accent text-accent-fg" : "border-hairline-strong",
                    )}
                  >
                    {on && <Check size={12} strokeWidth={3.2} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-subhead font-medium text-fg">
                      {e.title?.trim() || "Untitled note"} <span className="font-normal text-fg-3">· {formatDate(e.date)}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-footnote text-fg-2">
                      {e.snippet ? <Highlighted text={focusSnippet(e.snippet, [...terms, e.surface], 160)} terms={[...terms, e.surface]} /> : `Mentioned as “${e.surface}”`}
                    </span>
                  </span>
                </label>
              );
            })
          )}
        </div>
        <Field label="Who is the other person?" error={error ?? undefined}>
          <GlassInput value={name} onChange={(e) => setName(e.target.value)} placeholder={`e.g. ${proposal.displayName.split(" ")[0]} from Berlin`} maxLength={200} />
        </Field>
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Edit                                                               */
/* ------------------------------------------------------------------ */

export type EditPatch = {
  displayName: string;
  aliases: string[];
  createReminder: boolean;
  profile: Partial<Pick<ProfileProposal, "role" | "company" | "city" | "metContext" | "categories" | "activities" | "keyFacts" | "howICanHelp">>;
};

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
const list = (s: string) => s.split(",").map((l) => l.trim()).filter(Boolean);

/** E: a reduced person form for the proposal (saved as one `edit` decision). */
export function EditSheet({ open, onOpenChange, proposal, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; proposal: Proposal | null; onSave: (patch: EditPatch) => Promise<unknown> | void }) {
  const [form, setForm] = useState(() => toForm(proposal));
  const [error, setError] = useState<string | null>(null);
  useResetOnOpen(open, proposal?.id, () => {
    setForm(toForm(proposal));
    setError(null);
  });
  if (!proposal) return null;
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const hasFollowUp = proposal.profile.followUps.length > 0;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Edit person"
      size="large"
      cancel
      done="Save"
      onDone={async () => {
        if (!form.displayName.trim()) {
          setError("A name is required");
          return false;
        }
        await onSave({
          displayName: form.displayName.trim(),
          aliases: list(form.aliases),
          createReminder: form.createReminder,
          profile: {
            role: form.role.trim() || null,
            company: form.company.trim() || null,
            city: form.city.trim() || null,
            metContext: form.metContext.trim() || null,
            howICanHelp: form.howICanHelp.trim() || null,
            categories: form.categories,
            activities: list(form.activities),
            keyFacts: lines(form.keyFacts).slice(0, 8),
          },
        });
      }}
    >
      <form noValidate className="space-y-4 pb-2" onSubmit={(e) => e.preventDefault()}>
        <Field label="Name" error={error ?? undefined} required>
          <GlassInput value={form.displayName} onChange={(e) => set("displayName", e.target.value)} maxLength={200} autoComplete="off" />
        </Field>
        <Field label="Also written as" hint="Comma separated — nicknames and declined forms (Blažem, Blaž).">
          <GlassInput value={form.aliases} onChange={(e) => set("aliases", e.target.value)} autoComplete="off" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role">
            <GlassInput value={form.role} onChange={(e) => set("role", e.target.value)} maxLength={200} placeholder="Founder" />
          </Field>
          <Field label="Company">
            <GlassInput value={form.company} onChange={(e) => set("company", e.target.value)} maxLength={200} />
          </Field>
        </div>
        <Field label="Lives in" hint="A city — it is placed on the globe when you commit.">
          <GlassInput value={form.city} onChange={(e) => set("city", e.target.value)} maxLength={120} placeholder="Ljubljana" />
        </Field>
        <div className="space-y-1.5">
          <p className="px-1 text-footnote font-medium text-fg-2">Categories</p>
          <CategoryChips value={form.categories} onToggle={(slug) => set("categories", form.categories.includes(slug) ? form.categories.filter((c) => c !== slug) : [...form.categories, slug])} />
        </div>
        <Field label="Activities" hint="Comma separated, e.g. padel, hiking.">
          <GlassInput value={form.activities} onChange={(e) => set("activities", e.target.value)} autoComplete="off" />
        </Field>
        <Field label="How you met">
          <GlassTextarea value={form.metContext} onChange={(e) => set("metContext", e.target.value)} maxLength={600} rows={2} />
        </Field>
        <Field label="Key facts" hint="One per line (up to 8).">
          <GlassTextarea value={form.keyFacts} onChange={(e) => set("keyFacts", e.target.value)} rows={4} />
        </Field>
        <Field label="How you can help">
          <GlassTextarea value={form.howICanHelp} onChange={(e) => set("howICanHelp", e.target.value)} maxLength={600} rows={2} />
        </Field>
        <div className="rounded-md bg-fill-1 px-3.5 py-1.5">
          <Switch
            label="Create follow-up"
            description={hasFollowUp ? proposal.profile.followUps[0]!.what : "No follow-ups in these notes"}
            checked={hasFollowUp && form.createReminder}
            disabled={!hasFollowUp}
            onCheckedChange={(v) => set("createReminder", v)}
          />
        </div>
      </form>
    </Sheet>
  );
}

function toForm(p: Proposal | null) {
  return {
    displayName: p?.displayName ?? "",
    aliases: p?.aliases.join(", ") ?? "",
    role: p?.profile.role ?? "",
    company: p?.profile.company ?? "",
    city: p?.profile.city ?? "",
    metContext: p?.profile.metContext ?? "",
    howICanHelp: p?.profile.howICanHelp ?? "",
    categories: (p?.profile.categories ?? []) as (typeof CATEGORY_SLUGS)[number][],
    activities: p?.profile.activities.join(", ") ?? "",
    keyFacts: p?.profile.keyFacts.join("\n") ?? "",
    createReminder: p?.createReminder ?? true,
  };
}

/* ------------------------------------------------------------------ */
/*  Shortcut legend                                                    */
/* ------------------------------------------------------------------ */

export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["A", "↵"], label: "Approve" },
  { keys: ["X"], label: "Not a person" },
  { keys: ["P"], label: "Passer-by" },
  { keys: ["M"], label: "Merge into…" },
  { keys: ["S"], label: "Split" },
  { keys: ["E"], label: "Edit" },
  { keys: ["R"], label: "Rename" },
  { keys: ["1–7"], label: "Toggle a category" },
  { keys: ["F"], label: "Toggle follow-up" },
  { keys: ["J", "→"], label: "Later" },
  { keys: ["K", "←"], label: "Back" },
  { keys: ["⌘Z", "U"], label: "Undo" },
  { keys: ["?"], label: "Show shortcuts" },
];

export function ShortcutLegend({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Keyboard shortcuts" width={420}>
      <ul className="divide-y-[0.5px] divide-separator">
        {SHORTCUTS.map((s) => (
          <li key={s.label} className="flex min-h-11 items-center justify-between gap-4">
            <span className="text-body text-fg">{s.label}</span>
            <span className="flex gap-1">
              {s.keys.map((k) => (
                <Kbd key={k} className="h-6 min-w-6 px-1.5 text-footnote pointer-coarse:inline-grid">
                  {k}
                </Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-footnote text-fg-3">On iPhone: swipe right to approve, left for “not a person”; at the end of a card, swipe up for later.</p>
    </Sheet>
  );
}
