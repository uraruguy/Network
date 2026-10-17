"use client";
import { useState, type ReactElement } from "react";
import { GlassInput } from "@/components/glass/GlassInput";
import { ResponsivePopover } from "@/components/ui/ResponsivePopover";
import { cn } from "@/lib/utils";

const GROUPS: { label: string; emoji: string[] }[] = [
  { label: "Sport", emoji: ["⚽", "🏀", "🎾", "🏐", "🏓", "🏸", "🥊", "🏊", "🚴", "🏃", "🧗", "🥾", "⛷️", "🏂", "🏄", "🧘", "🏋️", "⛳", "🛶", "🤿"] },
  { label: "Food & drink", emoji: ["☕", "🍽️", "🍕", "🍣", "🍔", "🌮", "🍷", "🍺", "🍸", "🥂", "🧁", "🍳"] },
  { label: "Culture", emoji: ["🎬", "🎵", "🎸", "🎤", "🎨", "📚", "🎭", "🎮", "🎲", "♟️", "📷", "🎧"] },
  { label: "Travel & outdoors", emoji: ["✈️", "🚗", "⛺", "🏖️", "🏔️", "🌍", "🚆", "⛵", "🎣", "🌱", "🐕", "🚲"] },
  { label: "Life & work", emoji: ["💼", "💻", "🤝", "🎉", "👶", "🙏", "🛍️", "💬", "🧠", "🚀", "❤️", "⭐"] },
];

/** The first grapheme of a string (so "🏳️‍🌈x" → "🏳️‍🌈"). */
function firstGrapheme(s: string): string {
  const seg = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
  if (!seg) return [...s][0] ?? "";
  for (const { segment } of seg.segment(s.trim())) return segment;
  return "";
}

/**
 * Emoji grid in a popover (sheet on phones): curated groups for activities, "None", and a field
 * to type or paste any other emoji.
 */
export function EmojiPicker({ value, onChange, trigger, title = "Choose an emoji" }: { value: string | null; onChange: (emoji: string | null) => void; trigger: ReactElement; title?: string }) {
  const [custom, setCustom] = useState("");
  return (
    <ResponsivePopover trigger={trigger} title={title} className="w-[340px]">
      {(close) => {
        const pick = (e: string | null) => {
          onChange(e);
          setCustom("");
          close();
        };
        return (
          <div className="space-y-3 pb-1">
            {GROUPS.map((g) => (
              <section key={g.label} aria-label={g.label}>
                <h4 className="px-1 pb-1 text-caption font-semibold text-fg-3">{g.label}</h4>
                <div className="grid grid-cols-8 gap-0.5 sm:grid-cols-8">
                  {g.emoji.map((e) => (
                    <button
                      key={e}
                      type="button"
                      aria-label={e}
                      aria-pressed={value === e}
                      onClick={() => pick(e)}
                      className={cn("pressable grid aspect-square min-h-10 place-items-center rounded-xs text-title3 hover:bg-fill-2", value === e && "bg-accent-soft ring-1 ring-accent")}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </section>
            ))}
            <form
              noValidate
              className="flex items-center gap-2 border-t-[0.5px] border-separator pt-3"
              onSubmit={(ev) => {
                ev.preventDefault();
                const g = firstGrapheme(custom);
                if (g) pick(g);
              }}
            >
              <GlassInput value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Any emoji…" aria-label="Type or paste an emoji" className="h-10 flex-1 text-center" enterKeyHint="done" />
              <button type="submit" disabled={!firstGrapheme(custom)} className="pressable h-10 rounded-full bg-accent-soft px-4 text-subhead font-semibold text-accent-text disabled:opacity-40">
                Use
              </button>
              <button type="button" onClick={() => pick(null)} className="pressable h-10 rounded-full px-3 text-subhead text-fg-2 hover:bg-fill-1">
                None
              </button>
            </form>
          </div>
        );
      }}
    </ResponsivePopover>
  );
}
