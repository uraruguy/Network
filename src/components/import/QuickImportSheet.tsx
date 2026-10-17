"use client";
/**
 * Paste text (e.g. from Apple Notes) → AI extracts people/facts → mini review → save as notes.
 * With `personId`, that person is the note's owner. Saves through the import commit path
 * (a one-note job, source "paste"), so a save can be undone like any import.
 */
import { ClipboardPaste, MapPin, Sparkles, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { Avatar } from "@/components/glass/Avatar";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput, GlassTextarea } from "@/components/glass/GlassInput";
import { Combobox } from "@/components/ui/Combobox";
import { Field } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import { Switch } from "@/components/ui/Switch";
import { toast } from "@/components/ui/Toast";
import { ToggleChip } from "@/components/ui/ToggleChip";
import { QUICK_MAX_CHARS, type QuickAction } from "@/app/api/import/quick/schema";
import type { CATEGORY_SLUGS } from "@/lib/import/contracts";
import { searchMergeTargets, type MergeTarget } from "@/lib/queries/import-review";
import { useQuickExtract, useQuickSave, type QuickExtractResult, type QuickPerson } from "@/lib/queries/import-quick";
import { cn } from "@/lib/utils";
import { CategoryChips } from "./review/parts";
import { plural } from "./review/text";

export type QuickImportSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personId?: string;
  personName?: string;
  initialText?: string;
};

type Category = (typeof CATEGORY_SLUGS)[number];
type Choice = { action: QuickAction; matchPersonId: string | null; matchName: string | null; displayName: string; categories: Category[]; createReminder: boolean };

export function QuickImportSheet({ open, onOpenChange, personId, personName, initialText }: QuickImportSheetProps) {
  const router = useRouter();
  const extract = useQuickExtract();
  const save = useQuickSave();
  const [text, setText] = useState(initialText ?? "");
  const [result, setResult] = useState<QuickExtractResult | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [title, setTitle] = useState("");
  const [primary, setPrimary] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  // Fresh state every time the sheet opens (adjusted during render; mutations reset after close).
  const session = useRef(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setText(initialText ?? "");
      setResult(null);
      setChoices({});
      setError(null);
    }
  }

  const step = result ? "review" : extract.isPending ? "reading" : "paste";

  const pasteFromClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip.trim()) return toast("The clipboard is empty");
      setText((t) => (t.trim() ? `${t.trimEnd()}\n\n${clip}` : clip));
      textarea.current?.focus();
    } catch {
      toast.error("Couldn’t read the clipboard", { description: "Paste with ⌘V instead." });
    }
  };

  const findPeople = useCallback(async () => {
    const t = text.trim();
    if (t.length < 3) return setError("Paste a note first");
    setError(null);
    const ticket = ++session.current;
    try {
      const r = await extract.mutateAsync({ text: t, personId });
      if (ticket !== session.current) return;
      setResult(r);
      setTitle(r.title);
      setPrimary(r.primaryIndex);
      setChoices(
        Object.fromEntries(
          r.people.map((p) => [
            p.index,
            {
              action: p.action,
              matchPersonId: p.matchPersonId,
              matchName: p.suggestions.find((s) => s.id === p.matchPersonId)?.displayName ?? null,
              displayName: p.name,
              categories: p.categories as Category[],
              createReminder: true,
            } satisfies Choice,
          ]),
        ),
      );
    } catch (e) {
      if (ticket === session.current) setError(e instanceof Error ? e.message : "Couldn’t read the note");
    }
  }, [text, personId, extract]);

  const kept = result ? result.people.filter((p) => choices[p.index]?.action !== "skip") : [];
  const filedUnder = personId ? null : (primary != null && kept.some((p) => p.index === primary) ? primary : (kept[0]?.index ?? null));

  const onSave = async () => {
    if (!result) return false;
    if (!personId && !kept.length) {
      setError("Keep at least one person to file the note under");
      return false;
    }
    try {
      const r = await save.mutateAsync({
        text: text.trim(),
        title: title.trim() || null,
        personId,
        extraction: result.extraction,
        primaryIndex: filedUnder,
        people: result.people.map((p) => {
          const c = choices[p.index]!;
          return { index: p.index, action: c.action, matchPersonId: c.action === "merge" ? c.matchPersonId : null, displayName: c.displayName.trim() || p.name, categories: c.categories, createReminder: c.createReminder };
        }),
      });
      const where = r.personName ?? personName ?? "The Network";
      toast({
        type: "success",
        title: `Saved to ${where}`,
        description: [r.created && `${plural(r.created, "new person", "new people")}`, r.reminders && plural(r.reminders, "reminder")].filter(Boolean).join(" · ") || undefined,
        duration: 8000,
        action: r.noteId && r.personId ? { label: "Open note", onClick: () => router.push(`/people/${r.personId}/notes/${r.noteId}`) } : undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t save the note");
      return false;
    }
  };

  const set = (i: number, patch: Partial<Choice>) => setChoices((c) => ({ ...c, [i]: { ...c[i]!, ...patch } }));

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(o) => {
        if (o) return;
        session.current++;
        extract.reset();
        save.reset();
      }}
      title={personName ? `Note about ${personName}` : "Paste a note"}
      size="large"
      width={600}
      cancel
      dismissible={!text.trim()}
      initialFocus={textarea}
      headerRight={<span />}
      footer={
        step === "paste" ? (
          <div className="flex items-center gap-2">
            <GlassButton variant="ghost" onClick={pasteFromClipboard}>
              <ClipboardPaste size={18} /> Paste from clipboard
            </GlassButton>
            <GlassButton variant="primary" className="ml-auto" onClick={() => void findPeople()} disabled={!text.trim()}>
              <Sparkles size={18} /> Find people
            </GlassButton>
          </div>
        ) : step === "review" ? (
          <div className="flex items-center gap-2">
            <GlassButton variant="ghost" onClick={() => setResult(null)}>
              Edit text
            </GlassButton>
            <GlassButton variant="primary" className="ml-auto" loading={save.isPending} disabled={!personId && kept.length === 0} onClick={() => void onSave().then((ok) => ok !== false && onOpenChange(false))}>
              Save note{kept.length ? ` · ${plural(kept.length, "person", "people")}` : ""}
            </GlassButton>
          </div>
        ) : undefined
      }
    >
      {step === "paste" && (
        <div className="space-y-3 pt-1">
          <p className="text-subhead text-fg-2">Claude finds the people in it. You confirm who’s who before anything is saved.</p>
          <Field label="Note" error={error ?? undefined} accessory={text.length > QUICK_MAX_CHARS * 0.8 ? `${text.length.toLocaleString("en")} / ${QUICK_MAX_CHARS.toLocaleString("en")}` : undefined}>
            <GlassTextarea
              ref={textarea}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={personName ? `What happened with ${personName}?` : "Kava z Blažem — dela na robotiki v SF, rad bi intro do…"}
              rows={10}
              maxLength={QUICK_MAX_CHARS}
              className="min-h-56"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void findPeople();
                }
              }}
            />
          </Field>
          <p className="text-footnote text-fg-3">The text is sent to the AI provider to extract people; nothing is stored until you save.</p>
        </div>
      )}

      {step === "reading" && (
        <div className="space-y-4 py-2" aria-live="polite">
          <p className="flex items-center gap-2 text-subhead text-fg-2">
            <Spinner size={16} /> Reading the note…
          </p>
          <div className="surface overflow-hidden rounded-lg">
            <SkeletonRows count={3} />
          </div>
        </div>
      )}

      {step === "review" && result && (
        <div className="space-y-4 pt-1">
          <Field label="Title">
            <GlassInput value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} />
          </Field>
          {personId ? (
            <p className="text-subhead text-fg-2">
              Filed under <strong className="font-semibold text-fg">{result.owner?.displayName ?? personName}</strong>
              {result.people.some((p) => p.isOwner) ? "" : " — the note doesn’t name them, that’s fine."}
            </p>
          ) : (
            kept.length > 1 && (
              <div className="space-y-1.5">
                <p className="px-1 text-footnote font-medium text-fg-2">File the note under</p>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="File the note under">
                  {kept.map((p) => (
                    <ToggleChip key={p.index} pressed={filedUnder === p.index} onPressedChange={() => setPrimary(p.index)} showCheck>
                      {choices[p.index]?.displayName || p.name}
                    </ToggleChip>
                  ))}
                </div>
              </div>
            )
          )}
          {result.people.length === 0 ? (
            <p className="rounded-md bg-fill-1 px-4 py-6 text-center text-subhead text-fg-2">
              No people found in this note.{personId ? ` It will still be saved to ${personName ?? "them"}.` : " Add a name and try again."}
            </p>
          ) : (
            <ul className="space-y-3">
              {result.people.map((p) => (
                <li key={p.index}>
                  <QuickPersonCard person={p} choice={choices[p.index]!} onChange={(patch) => set(p.index, patch)} filedHere={!personId && filedUnder === p.index} />
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p role="alert" className="text-subhead text-danger">
              {error}
            </p>
          )}
          <p className="text-footnote text-fg-3">
            Extracted with the {result.model === "fast" ? "fast" : "main"} model. Existing people only get blanks filled — nothing is overwritten.
          </p>
        </div>
      )}
    </Sheet>
  );
}

/** One extracted person: keep as new, merge into someone existing, or skip. */
function QuickPersonCard({ person: p, choice: c, onChange, filedHere }: { person: QuickPerson; choice: Choice; onChange: (patch: Partial<Choice>) => void; filedHere: boolean }) {
  const [picking, setPicking] = useState(false);
  const skipped = c.action === "skip";
  const facts = [p.role, p.company].filter(Boolean).join(" · ");
  const search = useCallback(async (q: string) => (await searchMergeTargets("paste", q || p.name)).filter((t) => t.kind === "person"), [p.name]);
  const known = new Set(p.suggestions.map((s) => s.id));

  return (
    <article className={cn("surface rounded-lg p-3.5 transition-opacity", skipped && "opacity-60")} aria-label={p.name}>
      <div className="flex items-start gap-3">
        <Avatar name={c.displayName || p.name} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <input
              value={c.displayName}
              onChange={(e) => onChange({ displayName: e.target.value })}
              aria-label="Name"
              disabled={skipped}
              maxLength={200}
              className="-mx-1 min-w-0 flex-1 rounded-xs bg-transparent px-1 text-headline text-fg outline-none focus:bg-surface-2 focus:shadow-[0_0_0_3px_var(--focus-ring)]"
            />
            {filedHere && <span className="shrink-0 rounded-full bg-accent-soft px-2 text-caption font-semibold text-accent-text">Filed here</span>}
          </div>
          {(facts || p.city) && (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-footnote text-fg-3">
              {facts && <span>{facts}</span>}
              {p.city && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={12} strokeWidth={2.2} aria-hidden /> {p.city}
                </span>
              )}
            </p>
          )}
          {p.keyFacts.length > 0 && <p className="mt-1 line-clamp-2 text-footnote text-fg-2">{p.keyFacts.join(" · ")}</p>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={`What to do with ${p.name}`}>
        <ToggleChip size="sm" pressed={c.action === "create"} onPressedChange={() => onChange({ action: "create", matchPersonId: null, matchName: null })} icon={<UserPlus />}>
          New person
        </ToggleChip>
        {p.suggestions.map((s) => (
          <ToggleChip
            key={s.id}
            size="sm"
            pressed={c.action === "merge" && c.matchPersonId === s.id}
            onPressedChange={() => onChange({ action: "merge", matchPersonId: s.id, matchName: s.displayName })}
            title={s.detail ?? undefined}
          >
            = {s.displayName}
          </ToggleChip>
        ))}
        {c.action === "merge" && c.matchPersonId && !known.has(c.matchPersonId) && (
          <ToggleChip size="sm" pressed onPressedChange={() => setPicking(true)}>
            = {c.matchName}
          </ToggleChip>
        )}
        <ToggleChip size="sm" pressed={picking} onPressedChange={setPicking}>
          Someone else…
        </ToggleChip>
        <ToggleChip size="sm" pressed={skipped} onPressedChange={() => onChange({ action: "skip" })}>
          Skip
        </ToggleChip>
      </div>
      {picking && (
        <div className="mt-2">
          <Combobox<MergeTarget>
            autoFocus
            value={null}
            onChange={(t) => {
              if (t) onChange({ action: "merge", matchPersonId: t.id, matchName: t.displayName });
              setPicking(false);
            }}
            search={search}
            debounceMs={120}
            getKey={(t) => t.id}
            getLabel={(t) => t.displayName}
            placeholder="Search The Network"
            aria-label={`Merge ${p.name} into`}
            renderItem={(t) => (
              <span className="flex items-center gap-2.5">
                <Avatar name={t.displayName} size={24} />
                <span className="min-w-0 truncate">
                  {t.displayName}
                  {t.detail && <span className="text-fg-3"> · {t.detail}</span>}
                </span>
              </span>
            )}
          />
        </div>
      )}

      {!skipped && (
        <div className="mt-3 space-y-2">
          <CategoryChips size="sm" value={c.categories} onToggle={(slug) => onChange({ categories: c.categories.includes(slug) ? c.categories.filter((x) => x !== slug) : [...c.categories, slug] })} />
          {p.followUp && <Switch label="Create follow-up" description={p.followUp} checked={c.createReminder} onCheckedChange={(v) => onChange({ createReminder: v })} />}
        </div>
      )}
    </article>
  );
}
