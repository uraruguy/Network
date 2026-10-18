"use client";
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SegmentedItem<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  /** Accessible name when `label` is visual only. */
  ariaLabel?: string;
  disabled?: boolean;
};

export type SegmentedControlProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  items: SegmentedItem<T>[];
  size?: "sm" | "md" | "lg";
  /** Stretch to the container width (segments stay equal). */
  fullWidth?: boolean;
  "aria-label"?: string;
  className?: string;
};

const SIZE = {
  sm: "h-8 text-footnote",
  md: "h-9 text-subhead",
  lg: "h-11 text-subhead",
} as const;

/**
 * iOS segmented control: equal-width segments, a sliding thumb (pure CSS transform — no JS
 * animation), radio-group semantics with arrow-key / Home / End navigation.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  items,
  size = "md",
  fullWidth,
  "aria-label": ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(
    0,
    items.findIndex((i) => i.value === value),
  );
  const selectedExists = items.some((i) => i.value === value);

  const move = (from: number, dir: 1 | -1 | "first" | "last") => {
    const enabled = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);
    if (!enabled.length) return;
    let next: number;
    if (dir === "first") next = enabled[0]!;
    else if (dir === "last") next = enabled[enabled.length - 1]!;
    else {
      const pos = enabled.indexOf(from);
      next = enabled[(pos + dir + enabled.length) % enabled.length]!;
    }
    onChange(items[next]!.value);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const map: Record<string, 1 | -1 | "first" | "last"> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
      Home: "first",
      End: "last",
    };
    const dir = map[e.key];
    if (dir === undefined) return;
    e.preventDefault();
    move(i, dir);
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "relative grid auto-cols-fr grid-flow-col rounded-full bg-fill-2 p-0.5 select-none",
        fullWidth ? "w-full" : "w-fit",
        SIZE[size],
        className,
      )}
    >
      {selectedExists && (
        <span
          aria-hidden
          className="absolute top-0.5 bottom-0.5 left-0.5 rounded-full bg-segment-thumb shadow-[0_1px_2px_oklch(0.2_0.02_220/0.12),0_3px_8px_oklch(0.2_0.02_220/0.1)] transition-transform duration-[var(--spring-snappy-dur)] ease-[var(--spring-snappy)] motion-reduce:transition-none"
          style={{ width: `calc((100% - 4px) / ${items.length})`, transform: `translateX(${index * 100}%)` }}
        />
      )}
      {items.map((item, i) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={item.ariaLabel}
            tabIndex={active || (!selectedExists && i === 0) ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "relative z-[1] flex min-w-0 items-center justify-center gap-1.5 rounded-full px-3 font-medium whitespace-nowrap outline-offset-0 transition-colors duration-150 disabled:opacity-40 [&_svg]:size-[15px] [&_svg]:shrink-0",
              active ? "text-fg" : "text-fg-2 hover:text-fg",
            )}
          >
            {item.icon}
            {item.label !== undefined && item.label !== null && <span className="truncate">{item.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
