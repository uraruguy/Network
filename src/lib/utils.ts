import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge taught about the design-system scales — otherwise it reads `text-footnote`
 * as a text *colour* and drops it next to `text-fg-2`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["large-title", "title1", "title2", "title3", "headline", "body", "callout", "subhead", "footnote", "caption", "caption2"],
      shadow: ["e1", "e2", "e3", "e4"],
      ease: ["ios", "spring"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Deterministic hue (0–359) from a string — used for avatar fallbacks. */
export function hueFromString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

// Formatters live in ./format (cached Intl instances); re-exported here for existing imports.
export { formatDate, formatRelative, formatShortDate, formatTime, localTimeIn, toDate } from "./format";

export function flag(countryCode?: string | null) {
  if (!countryCode || countryCode.length !== 2) return "";
  return String.fromCodePoint(...[...countryCode.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** `color` is a CSS value for DOM styles; `token` is the custom property name for canvas/WebGL (see useResolvedTokens). */
export const WARMTH_META = {
  inner: { label: "Inner circle", color: "var(--warm-inner)", token: "--warm-inner", hint: "People closest to you" },
  active: { label: "Active", color: "var(--warm-active)", token: "--warm-active", hint: "In regular contact" },
  dormant: { label: "Dormant", color: "var(--warm-dormant)", token: "--warm-dormant", hint: "Worth reviving" },
  archive: { label: "Archive", color: "var(--warm-archive)", token: "--warm-archive", hint: "Keeping the record" },
} as const;

export function locationLabel(l?: { name: string; country: string; countryCode?: string | null } | null) {
  if (!l) return "";
  return `${flag(l.countryCode)} ${l.name}, ${l.country}`.trim();
}

export const CIRCLE_META = {
  nice_to_know: { label: "Nice to know", short: "Nice to know", color: "var(--circle-nice)", token: "--circle-nice", hint: "Good to have in the network" },
  hang_out_more: { label: "Want to hang out more", short: "Hang out more", color: "var(--circle-more)", token: "--circle-more", hint: "I'd like to see them more often" },
  potential_close: { label: "Potential to be very close", short: "Very close", color: "var(--circle-close)", token: "--circle-close", hint: "Could become one of my closest people" },
} as const;

export const HOBBY_META: Record<string, { label: string; emoji: string }> = {
  football: { label: "Football", emoji: "⚽️" },
  skiing: { label: "Skiing", emoji: "⛷️" },
  hiking: { label: "Hiking", emoji: "🥾" },
  running: { label: "Running", emoji: "🏃" },
  padel: { label: "Padel", emoji: "🎾" },
  partying: { label: "Partying", emoji: "🪩" },
  coffee: { label: "Just coffee", emoji: "☕️" },
  lunch: { label: "Lunch guy", emoji: "🍽️" },
  gym: { label: "Gym", emoji: "🏋️" },
  other: { label: "Other", emoji: "✨" },
};
