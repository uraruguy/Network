"use client";
import { Blocks, MoreHorizontal, Plus, SmilePlus, Trash2 } from "lucide-react";
import { useState } from "react";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput } from "@/components/glass/GlassInput";
import { confirm } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Menu } from "@/components/ui/Menu";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { useActivities, useCreateActivity, useDeleteActivity, useReorderActivities, useUpdateActivity } from "@/lib/queries/taxonomy";
import type { ActivityRow } from "@/lib/queries/types";
import { slugify } from "@/lib/text";
import { cn } from "@/lib/utils";
import { EmojiPicker } from "../parts/EmojiPicker";
import { ReorderList } from "../parts/ReorderList";
import { SectionPage } from "../SettingsShell";

const SUGGESTIONS: [string, string][] = [
  ["☕", "Coffee"],
  ["🍽️", "Dinners"],
  ["🍺", "Drinks"],
  ["🏃", "Running"],
  ["⚽", "Football"],
  ["🎾", "Tennis"],
  ["🥾", "Hiking"],
  ["🧗", "Climbing"],
  ["🚴", "Cycling"],
  ["⛷️", "Skiing"],
  ["🏊", "Swimming"],
  ["🧘", "Yoga"],
  ["🎮", "Gaming"],
  ["🎲", "Board games"],
  ["📚", "Book club"],
  ["🎵", "Concerts"],
  ["🎬", "Movies"],
  ["✈️", "Travel"],
  ["💼", "Work"],
  ["🚀", "Startups"],
];

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

export function ActivitiesSection() {
  const { data: activities = [], isPending } = useActivities();
  const create = useCreateActivity();
  const reorder = useReorderActivities();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const slugs = new Set(activities.map((a) => a.slug));
  const suggestions = SUGGESTIONS.filter(([, n]) => !slugs.has(slugify(n)));

  const add = (n: string, e: string | null) => {
    const trimmed = n.trim();
    if (!slugify(trimmed)) return setError("Give the activity a name.");
    if (slugs.has(slugify(trimmed))) return setError("You already have this activity.");
    setError(null);
    create.mutate(
      { name: trimmed, emoji: e },
      {
        onSuccess: () => toast.success(`Added ${e ? `${e} ` : ""}${trimmed}`),
        onError: (err) => toast.error("Couldn't add the activity", { description: err.message }),
      },
    );
  };

  return (
    <SectionPage id="activities" description="Things you do with people — football, dinners, hiking. They show on profiles and filter the globe.">
      {isPending ? (
        <div className="surface overflow-hidden rounded-lg">
          <SkeletonRows count={5} />
        </div>
      ) : activities.length === 0 ? (
        <div className="surface rounded-lg">
          <EmptyState compact icon={<Blocks />} title="No activities yet" description="Add your own below or pick from the suggestions." />
        </div>
      ) : (
        <section className="space-y-1.5">
          <ReorderList
            aria-label="Activities"
            items={activities}
            getId={(a) => a.id}
            getLabel={(a) => a.name}
            onReorder={(ids) => reorder.mutateAsync(ids).catch((e: Error) => toast.error("Couldn't save the order", { description: e.message }))}
            renderItem={(a, { handle }) => <ActivityItem activity={a} others={activities} handle={handle} />}
          />
          <p className="px-4 text-footnote text-fg-3">Tap a name to rename it, the emoji to change it. Drag the handle to reorder.</p>
        </section>
      )}

      <section className="space-y-1.5" aria-labelledby="new-activity">
        <h3 id="new-activity" className="px-4 text-footnote font-medium tracking-[0.02em] text-fg-3 uppercase">
          New activity
        </h3>
        <form
          noValidate
          className="surface flex items-center gap-2 rounded-lg p-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            add(name, emoji);
            if (slugify(name) && !slugs.has(slugify(name))) {
              setName("");
              setEmoji(null);
            }
          }}
        >
          <EmojiPicker
            value={emoji}
            onChange={setEmoji}
            trigger={
              <button type="button" aria-label={emoji ? `Emoji ${emoji} — change` : "Choose an emoji"} className="pressable grid size-11 shrink-0 place-items-center rounded-sm bg-fill-1 text-title3 hover:bg-fill-2">
                {emoji ?? <SmilePlus size={20} className="text-fg-3" />}
              </button>
            }
          />
          <GlassInput
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            placeholder="e.g. Padel"
            aria-label="Activity name"
            aria-invalid={!!error || undefined}
            aria-describedby={error ? "new-activity-error" : undefined}
            maxLength={60}
            enterKeyHint="done"
            className="min-w-0 flex-1"
          />
          <GlassButton type="submit" variant="primary" size="icon" aria-label="Add activity" disabled={!name.trim()} loading={create.isPending}>
            <Plus size={20} />
          </GlassButton>
        </form>
        {error && (
          <p id="new-activity-error" role="alert" className="px-4 text-caption text-danger">
            {error}
          </p>
        )}
      </section>

      {suggestions.length > 0 && (
        <section className="space-y-2" aria-labelledby="activity-suggestions">
          <h3 id="activity-suggestions" className="px-4 text-footnote font-medium tracking-[0.02em] text-fg-3 uppercase">
            Suggestions
          </h3>
          <div className="flex flex-wrap gap-2 px-1">
            {suggestions.map(([e, n]) => (
              <button key={n} type="button" onClick={() => add(n, e)} className="pressable hit-44 inline-flex h-9 items-center gap-1.5 rounded-full bg-fill-2 px-3.5 text-subhead text-fg-2 hover:bg-fill-3 hover:text-fg">
                <span aria-hidden>{e}</span>
                {n}
                <Plus size={14} className="text-fg-4" aria-hidden />
              </button>
            ))}
          </div>
        </section>
      )}
    </SectionPage>
  );
}

function ActivityItem({ activity: a, others, handle }: { activity: ActivityRow; others: ActivityRow[]; handle: React.ReactNode }) {
  const update = useUpdateActivity();
  const remove = useDeleteActivity();
  const [name, setName] = useState<string | null>(null);

  const rename = () => {
    if (name === null) return;
    const next = name.trim();
    if (!next || next === a.name) return setName(null);
    if (others.some((o) => o.id !== a.id && o.slug === slugify(next))) {
      toast.error("Another activity already has this name");
      return setName(null);
    }
    update.mutate({ id: a.id, patch: { name: next } }, { onSettled: () => setName(null), onError: (e) => toast.error("Couldn't rename", { description: e.message }) });
  };

  const del = async () => {
    const ok = await confirm({
      title: `Delete ${a.emoji ? `${a.emoji} ` : ""}${a.name}?`,
      message: a.count ? `It's linked to ${people(a.count)}; they'll just lose this activity.` : "No one has this activity yet.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    remove.mutate(a.id, { onSuccess: () => toast(`Deleted ${a.name}`), onError: (e) => toast.error("Couldn't delete", { description: e.message }) });
  };

  return (
    <div className="flex min-h-[52px] items-center gap-3 pr-2 pl-4">
      <EmojiPicker
        value={a.emoji}
        onChange={(emoji) => update.mutate({ id: a.id, patch: { emoji } }, { onError: (e) => toast.error("Couldn't change the emoji", { description: e.message }) })}
        title={`Emoji for ${a.name}`}
        trigger={
          <button type="button" aria-label={`Change emoji for ${a.name}`} className="pressable grid size-[30px] shrink-0 place-items-center rounded-xs bg-fill-1 text-headline hover:bg-fill-2">
            {a.emoji ?? <SmilePlus size={16} className="text-fg-4" />}
          </button>
        }
      />
      <div className="min-w-0 flex-1 py-1.5">
        <input
          value={name ?? a.name}
          onChange={(e) => setName(e.target.value)}
          onBlur={rename}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setName(null);
              e.currentTarget.blur();
            }
          }}
          aria-label={`Name of ${a.name}`}
          maxLength={60}
          enterKeyHint="done"
          className={cn("-mx-1.5 block h-7 w-full min-w-0 rounded-xs bg-transparent px-1.5 text-body text-fg outline-none focus:bg-fill-1 focus:shadow-[0_0_0_3px_var(--focus-ring)]")}
        />
        <span className="block text-footnote text-fg-3">{people(a.count)}</span>
      </div>
      <Menu
        title={a.name}
        trigger={<IconButton size="sm" variant="plain" label={`More for ${a.name}`} icon={<MoreHorizontal />} />}
        items={[{ label: "Delete…", icon: <Trash2 />, destructive: true, onSelect: () => void del() }]}
        align="end"
      />
      {handle}
    </div>
  );
}
