"use client";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput } from "@/components/glass/GlassInput";
import { Field } from "@/components/ui/Field";
import { ResponsivePopover } from "@/components/ui/ResponsivePopover";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { ToggleChip } from "@/components/ui/ToggleChip";
import { keys } from "@/lib/queries/keys";
import { useActivities, useCreateActivity } from "@/lib/queries/taxonomy";
import type { ActivityRow } from "@/lib/queries/types";
import { slugify } from "@/lib/text";
import { cn } from "@/lib/utils";

/** Emoji choices for new activities — things people do together. */
export const ACTIVITY_EMOJI = [
  "☕️", "🍽️", "🍻", "🍷", "🍕", "🍣", "🎉", "🪩",
  "⚽️", "🎾", "🏓", "🏀", "🏐", "⛳️", "🏃", "🚴",
  "🏊", "🧗", "⛷️", "🏂", "🥾", "🏋️", "🧘", "⛵️",
  "🎤", "🎸", "🎮", "🎲", "♟️", "🎬", "🎭", "🖼️",
  "📚", "✈️", "🏕️", "🎣", "🐶", "💼", "💻", "✨",
];

type Props = {
  /** Selected activity ids. */
  value: string[];
  onChange: (ids: string[]) => void;
  id?: string;
  className?: string;
};

/**
 * "Do together": the user's activities as emoji chips (their own order), multi-select. "New"
 * creates one optimistically — it appears and is selected at once, the server catches up. The
 * create is queued so that the person save using it waits for it (offline too; see
 * lib/queries/write-order), or the server would drop the unknown id.
 */
export function ActivityPicker({ value, onChange, id, className }: Props) {
  const qc = useQueryClient();
  const { data: activities, isPending } = useActivities();
  const create = useCreateActivity();
  const [open, setOpen] = useState(false);
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  const toggle = (actId: string, on: boolean) => onChange(on ? [...value, actId] : value.filter((v) => v !== actId));
  const select = (actId: string) => !latest.current.includes(actId) && onChange([...latest.current, actId]);

  /** Selects an existing activity with that name, or creates it optimistically. Returns an error message. */
  const add = (name: string, emoji: string | null): string | null => {
    const clean = name.replace(/\s+/g, " ").trim();
    const slug = slugify(clean);
    if (!slug) return clean ? "Use at least one letter or digit" : "Give it a name";
    const rows = qc.getQueryData<ActivityRow[]>(keys.activities()) ?? activities ?? [];
    const existing = rows.find((a) => a.slug === slug);
    if (existing) {
      select(existing.id);
      return null;
    }
    const tempId = crypto.randomUUID();
    const row: ActivityRow = { id: tempId, name: clean, slug, emoji, sort: Math.max(-1, ...rows.map((a) => a.sort)) + 1, count: 0 };
    qc.setQueryData<ActivityRow[]>(keys.activities(), (list) => [...(list ?? []), row]);
    select(tempId);
    create.mutate(
      { id: tempId, name: clean, emoji },
      {
        // Same name created elsewhere meanwhile: the server returns that activity — use its id.
        onSuccess: (saved) => saved.id !== tempId && onChange(latest.current.map((v) => (v === tempId ? saved.id : v))),
        onError: (err) => {
          qc.setQueryData<ActivityRow[]>(keys.activities(), (list) => list?.filter((a) => a.id !== tempId));
          onChange(latest.current.filter((v) => v !== tempId));
          toast.error(`Couldn’t add “${clean}”`, { description: err.message });
        },
      },
    );
    return null;
  };

  return (
    <div id={id} role="group" aria-label="Do together" className={cn("flex flex-wrap gap-2", className)}>
      {isPending && !activities
        ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 rounded-full" style={{ width: 76 + ((i * 29) % 44) }} />)
        : activities?.map((a) => (
            <ToggleChip key={a.id} pressed={value.includes(a.id)} onPressedChange={(on) => toggle(a.id, on)} icon={a.emoji ? <Emoji>{a.emoji}</Emoji> : undefined}>
              {a.name}
            </ToggleChip>
          ))}
      <ResponsivePopover
        title="New activity"
        open={open}
        onOpenChange={setOpen}
        className="w-[340px]"
        trigger={
          <button
            type="button"
            className="pressable hit-44 relative inline-flex h-8 shrink-0 items-center gap-1 rounded-full border-[0.5px] border-dashed border-hairline-strong px-3 text-footnote font-medium text-accent-text hover:bg-accent-soft"
          >
            <Plus size={14} strokeWidth={2.6} aria-hidden />
            New
          </button>
        }
      >
        {(close) => <NewActivityForm onSubmit={(name, emoji) => { const err = add(name, emoji); if (!err) close(); return err; }} />}
      </ResponsivePopover>
    </div>
  );
}

function Emoji({ children }: { children: string }) {
  return (
    <span aria-hidden className="text-subhead leading-none">
      {children}
    </span>
  );
}

function NewActivityForm({ onSubmit }: { onSubmit: (name: string, emoji: string | null) => string | null }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    // Rendered in a portal inside the person form: don't let the submit bubble (React tree) to it.
    e?.stopPropagation();
    setError(onSubmit(name, emoji));
  };

  return (
    <form noValidate onSubmit={submit} className="space-y-3">
      <Field label="Name" error={error}>
        <GlassInput
          value={name}
          autoFocus
          maxLength={60}
          placeholder="Climbing, board games…"
          enterKeyHint="done"
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
      </Field>
      <div role="radiogroup" aria-label="Emoji" className="grid grid-cols-8 gap-0.5">
        {ACTIVITY_EMOJI.map((e) => (
          <button
            key={e}
            type="button"
            role="radio"
            aria-checked={emoji === e}
            aria-label={e}
            onClick={() => setEmoji(emoji === e ? null : e)}
            className={cn(
              "pressable grid aspect-square min-h-9 place-items-center rounded-xs text-title3 leading-none transition-colors duration-150",
              emoji === e ? "bg-accent-soft ring-2 ring-accent" : "hover:bg-fill-1",
            )}
          >
            {e}
          </button>
        ))}
      </div>
      <GlassButton type="submit" variant="primary" className="w-full">
        {emoji ? <span aria-hidden>{emoji}</span> : <Plus size={18} strokeWidth={2.5} aria-hidden />}
        Add {name.trim() ? `“${name.trim()}”` : "activity"}
      </GlassButton>
    </form>
  );
}
