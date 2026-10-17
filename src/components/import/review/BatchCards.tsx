"use client";
import { Check, FileX2, FolderOpen, Tag, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { GlassButton } from "@/components/glass/GlassButton";
import { toast } from "@/components/ui/Toast";
import { useBatchAction, useBatchSummary } from "@/lib/queries/import-review";
import { cn, formatDate } from "@/lib/utils";
import { plural } from "./text";

const HIDE_KEY = (source: string) => `import-batch-hidden:${source}`;

function readHidden(source: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(HIDE_KEY(source)) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/**
 * Whole-batch decisions shown when the stack is done (and above the commit summary):
 * deleted notes, notes without people, and folders → tags.
 */
export function BatchCards({ source, className }: { source: string; className?: string }) {
  const q = useBatchSummary(source);
  const act = useBatchAction(source);
  const [hidden, setHidden] = useState<string[]>(() => readHidden(source));
  const [tags, setTags] = useState<Record<string, boolean>>({});

  const hide = (key: string) => {
    const next = [...new Set([...hidden, key])];
    setHidden(next);
    try {
      localStorage.setItem(HIDE_KEY(source), JSON.stringify(next));
    } catch {}
  };

  const data = q.data;
  if (!data) return null;
  const goneKey = `gone:${data.gone.count}`;
  const emptyKey = `empty:${data.noPeople.count}`;
  const showGone = data.gone.count > 0 && !hidden.includes(goneKey);
  const showEmpty = data.noPeople.count > 0 && !hidden.includes(emptyKey);
  const showFolders = data.folders.length > 0 && !hidden.includes("folders");
  if (!showGone && !showEmpty && !showFolders) return null;

  const since = data.gone.since ? formatDate(data.gone.since, { day: undefined, month: "long", year: undefined }) : null;
  const quote = (titles: string[], count: number) => `${titles.slice(0, 3).map((t) => `“${t}”`).join(", ")}${count > 3 ? ` and ${count - 3} more` : ""}`;

  return (
    <div className={cn("space-y-3", className)}>
      {showGone && (
        <BatchCard
          icon={<Trash2 />}
          title={`${plural(data.gone.count, "note")} deleted from Apple Notes${since ? ` since ${since}` : ""} — import anyway?`}
          description={`They still mention people: ${quote(data.gone.titles, data.gone.count)}.`}
          actions={
            <>
              <GlassButton size="sm" variant="ghost" onClick={() => hide(goneKey)}>
                Leave out
              </GlassButton>
              <GlassButton
                size="sm"
                variant="soft"
                loading={act.isPending && act.variables?.action === "restore-gone"}
                onClick={() =>
                  act.mutate(
                    { action: "restore-gone" },
                    {
                      onSuccess: (r) => toast.success(`${plural(r.restored ?? 0, "note")} back in the import`),
                      onError: (e) => toast.error("Couldn’t restore them", { description: e.message }),
                    },
                  )
                }
              >
                Import anyway
              </GlassButton>
            </>
          }
        />
      )}
      {showEmpty && (
        <BatchCard
          icon={<FileX2 />}
          title={`${plural(data.noPeople.count, "note")} with no people — dismiss?`}
          description={`Nobody in them needs a card: ${quote(data.noPeople.titles, data.noPeople.count)}.`}
          actions={
            <>
              <GlassButton size="sm" variant="ghost" onClick={() => hide(emptyKey)}>
                Keep
              </GlassButton>
              <GlassButton
                size="sm"
                variant="soft"
                loading={act.isPending && act.variables?.action === "dismiss-no-people"}
                onClick={() =>
                  act.mutate(
                    { action: "dismiss-no-people" },
                    {
                      onSuccess: (r) => toast.success(`Dismissed ${plural(r.dismissed ?? 0, "note")}`),
                      onError: (e) => toast.error("Couldn’t dismiss them", { description: e.message }),
                    },
                  )
                }
              >
                Dismiss
              </GlassButton>
            </>
          }
        />
      )}
      {showFolders && (
        <BatchCard
          icon={<Tag />}
          title="Turn folders into tags"
          description="Tag everyone mentioned in a folder — handy for trips and companies."
          actions={
            <GlassButton size="sm" variant="ghost" onClick={() => hide("folders")}>
              Done
            </GlassButton>
          }
        >
          <ul className="mt-3 divide-y-[0.5px] divide-separator overflow-hidden rounded-md bg-fill-1" aria-label="Folders">
            {data.folders.slice(0, 12).map((f) => {
              const on = tags[f.name] ?? (f.people > 0 && f.applied === f.people);
              const partial = tags[f.name] === undefined && f.applied > 0 && f.applied < f.people;
              return (
                <li key={f.name}>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-fill-1">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={on}
                      onChange={() => {
                        const next = !on;
                        setTags((t) => ({ ...t, [f.name]: next }));
                        act.mutate(
                          { action: "folder-tags", changes: [{ folder: f.name, on: next }] },
                          {
                            onSuccess: (r) => toast(next ? `Tagged ${plural(r.updated ?? 0, "person", "people")} “${f.name}”` : `Removed the “${f.name}” tag`),
                            onError: (e) => {
                              setTags((t) => ({ ...t, [f.name]: !next }));
                              toast.error("Couldn’t update the tags", { description: e.message });
                            },
                          },
                        );
                      }}
                    />
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-xs border-[1.5px] transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)]",
                        on ? "border-accent bg-accent text-accent-fg" : partial ? "border-accent" : "border-hairline-strong",
                      )}
                    >
                      {on ? <Check size={13} strokeWidth={3.2} /> : partial ? <span className="h-0.5 w-2.5 rounded-full bg-accent" /> : null}
                    </span>
                    <FolderOpen size={16} strokeWidth={2.2} className="shrink-0 text-fg-3" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-body text-fg">{f.name}</span>
                    <span className="shrink-0 text-footnote text-fg-3">
                      {plural(f.people, "person", "people")} · {plural(f.notes, "note")}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </BatchCard>
      )}
    </div>
  );
}

function BatchCard({ icon, title, description, actions, children }: { icon: ReactNode; title: string; description?: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <section className="surface rounded-lg p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-text [&_svg]:size-[18px]">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-headline text-fg">{title}</h3>
          {description && <p className="mt-0.5 text-subhead text-fg-2">{description}</p>}
        </div>
      </div>
      {children}
      {actions && <div className="mt-3 flex flex-wrap justify-end gap-2">{actions}</div>}
    </section>
  );
}
