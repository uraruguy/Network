"use client";
import { AlertCircle, Info } from "lucide-react";
import type { ReactNode } from "react";
import { ToggleChip } from "@/components/ui/ToggleChip";
import { CATEGORY_SLUGS } from "@/lib/import/contracts";
import { useCategories } from "@/lib/queries/people";
import { cn } from "@/lib/utils";
import { highlightSegments, type FlagSentence } from "./text";

/** Keyboard hint; hidden on touch-first devices. */
export function Kbd({ children, className, decorative }: { children: ReactNode; className?: string; decorative?: boolean }) {
  return (
    <kbd
      aria-hidden={decorative || undefined}
      className={cn(
        "inline-grid h-5 min-w-5 place-items-center rounded-xs border-[0.5px] border-hairline-strong bg-fill-1 px-1 font-sans text-caption2 font-semibold text-fg-3 pointer-coarse:hidden",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function SectionLabel({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <h3 className="text-footnote font-semibold tracking-[0.02em] text-fg-3 uppercase">{children}</h3>
      {action}
    </div>
  );
}

/** Text with the person's name highlighted. */
export function Highlighted({ text, terms, className }: { text: string; terms: string[]; className?: string }) {
  return (
    <span className={className}>
      {highlightSegments(text, terms).map((s, i) =>
        s.hit ? (
          <mark key={i} className="rounded-[0.2em] bg-accent-soft px-[0.1em] text-accent-text">
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </span>
  );
}

export function FlagList({ flags }: { flags: FlagSentence[] }) {
  if (!flags.length) return null;
  return (
    <ul className="space-y-1" aria-label="Why this needs a look">
      {flags.map((f) => (
        <li key={f.key} className={cn("flex items-start gap-2 text-subhead", f.tone === "warn" ? "text-fg" : "text-fg-2")}>
          {f.tone === "warn" ? (
            <AlertCircle size={16} strokeWidth={2.2} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          ) : (
            <Info size={16} strokeWidth={2.2} className="mt-0.5 shrink-0 text-fg-3" aria-hidden />
          )}
          <span>{f.text}</span>
        </li>
      ))}
    </ul>
  );
}

export const CATEGORY_FALLBACK: Record<string, string> = {
  mentor: "Mentor",
  friend: "Friend",
  partner: "Business partner",
  investor: "Investor",
  client: "Client",
  founder: "Peer founder",
  acquaint: "Acquaintance",
};

/** The seven import categories with the owner's names and colours (keys 1–7). */
export function useImportCategories() {
  const { data: cats = [] } = useCategories();
  return CATEGORY_SLUGS.map((slug, i) => {
    const c = cats.find((x) => x.slug === slug);
    return { slug, key: String(i + 1), name: c?.name ?? CATEGORY_FALLBACK[slug] ?? slug, color: c?.color };
  });
}

export function CategoryChips({
  value,
  onToggle,
  disabled,
  showKeys,
  size = "md",
}: {
  value: string[];
  onToggle: (slug: (typeof CATEGORY_SLUGS)[number]) => void;
  disabled?: boolean;
  showKeys?: boolean;
  size?: "sm" | "md";
}) {
  const cats = useImportCategories();
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Categories">
      {cats.map((c) => (
        <ToggleChip
          key={c.slug}
          size={size}
          pressed={value.includes(c.slug)}
          onPressedChange={() => onToggle(c.slug)}
          color={c.color}
          disabled={disabled}
          aria-keyshortcuts={showKeys ? c.key : undefined}
          className="disabled:opacity-50"
        >
          {c.name}
          {showKeys && (
            <span aria-hidden className="-mr-0.5 text-caption2 opacity-55 pointer-coarse:hidden">
              {c.key}
            </span>
          )}
        </ToggleChip>
      ))}
    </div>
  );
}

/** Thin progress bar. */
export function ProgressBar({ value, className, label }: { value: number; className?: string; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-fill-2", className)}
    >
      <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{ width: `${pct}%` }} />
    </div>
  );
}
